'use client'

import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { useDroppable, useDndMonitor } from '@dnd-kit/core'
import DraggableEvent from './DraggableEvent'
import { computeResizedEnd } from '@/lib/dnd'
import { cn } from '@/components/ui/utils'
import type { Event } from '@/lib/db/schema'
import type { CalendarDropData } from '@/lib/dnd'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'
const HOUR_HEIGHT = 48
const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2
const TOTAL_HOURS = 24
const AUTO_SCROLL_ZONE = 40
const AUTO_SCROLL_SPEED = 8

type DayViewProps = {
  currentDate: Date
  events: Event[]
  onCreateEvent: (date: Date) => void
  onSelectEvent: (event: Event) => void
  onEventResize?: (eventId: number, newEnd: string) => Promise<void>
}

function getMadridDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
}

function getAllDayDateString(isoString: string): string {
  return isoString.substring(0, 10)
}

function getMadridHours(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  return hour + minute / 60
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function getBaseEventId(event: Event): number {
  // Recurring event instances have synthetic composite ids like "123_2025-04-07"
  const id = event.id as number | string
  if (typeof id === 'string' && id.includes('_')) {
    return parseInt(id.split('_')[0])
  }
  return typeof id === 'string' ? parseInt(id) : id
}

type LayoutColumn = { event: Event; left: number; width: number }

function layoutOverlapping(dayEvents: Event[]): LayoutColumn[] {
  if (dayEvents.length === 0) return []

  const sorted = [...dayEvents].sort((a, b) => {
    const aStart = getMadridHours(new Date(a.start))
    const bStart = getMadridHours(new Date(b.start))
    if (aStart !== bStart) return aStart - bStart
    const aDur = getMadridHours(new Date(a.end)) - aStart
    const bDur = getMadridHours(new Date(b.end)) - bStart
    return bDur - aDur
  })

  const columns: Event[][] = []
  const eventColumn = new Map<Event, number>()

  for (const event of sorted) {
    const evStart = getMadridHours(new Date(event.start))
    let placed = false
    for (let c = 0; c < columns.length; c++) {
      const lastInCol = columns[c][columns[c].length - 1]
      const lastEnd = getMadridHours(new Date(lastInCol.end))
      if (evStart >= lastEnd) {
        columns[c].push(event)
        eventColumn.set(event, c)
        placed = true
        break
      }
    }
    if (!placed) {
      columns.push([event])
      eventColumn.set(event, columns.length - 1)
    }
  }

  const totalCols = columns.length
  return sorted.map(event => {
    const col = eventColumn.get(event)!
    return {
      event,
      left: (col / totalCols) * 100,
      width: (1 / totalCols) * 100,
    }
  })
}

// --- Droppable slot component ---

function DroppableTimeSlot({
  dateStr,
  hour,
  half,
  onCreateEvent,
  day,
}: {
  dateStr: string
  hour: number
  half: 0 | 1
  onCreateEvent: (date: Date) => void
  day: Date
}) {
  const minute = half * 30
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  const droppableId = `day-slot-${dateStr}-${timeStr}`

  const dropData: CalendarDropData = {
    date: dateStr,
    time: timeStr,
    view: 'day',
  }

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: dropData,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'cursor-pointer border-b border-dr-border/50 hover:bg-dr-hover',
        half === 0 && 'border-b-dr-border',
        isOver && 'bg-dr-green/15'
      )}
      style={{ height: HALF_HOUR_HEIGHT }}
      onClick={() => {
        const d = new Date(day)
        d.setHours(hour, minute, 0, 0)
        onCreateEvent(d)
      }}
    />
  )
}

// --- Droppable all-day area ---

function DroppableAllDayArea({
  dateStr,
  children,
}: {
  dateStr: string
  children: React.ReactNode
}) {
  const dropData: CalendarDropData = {
    date: dateStr,
    time: null,
    view: 'day',
  }

  const { setNodeRef, isOver } = useDroppable({
    id: `day-allday-${dateStr}`,
    data: dropData,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-1 flex-wrap gap-1 transition-colors',
        isOver && 'bg-dr-green/15'
      )}
    >
      {children}
    </div>
  )
}

// --- Resize handle component ---

function ResizeHandle({
  event,
  onEventResize,
}: {
  event: Event
  onEventResize: (eventId: number, newEnd: string) => Promise<void>
}) {
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const startY = e.clientY
    const pixelsPerMinute = HOUR_HEIGHT / 60
    const eventId = getBaseEventId(event)

    const target = (e.target as HTMLElement).closest('[data-resize-event]') as HTMLElement | null
    const eventBlock = target?.parentElement
    if (!eventBlock) return

    const originalHeight = eventBlock.offsetHeight

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY
      const deltaMinutes = Math.round(deltaY / pixelsPerMinute / 15) * 15
      const newHeight = originalHeight + deltaMinutes * pixelsPerMinute
      eventBlock.style.height = `${Math.max(newHeight, HALF_HOUR_HEIGHT)}px`
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)

      // Suppress the synthetic click that fires after pointerup so the
      // edit modal doesn't open when releasing a resize drag.
      const suppressClick = (ev: MouseEvent) => {
        ev.stopPropagation()
        document.removeEventListener('click', suppressClick, true)
      }
      document.addEventListener('click', suppressClick, true)

      const deltaY = upEvent.clientY - startY
      const deltaMinutes = Math.round(deltaY / (HOUR_HEIGHT / 60) / 15) * 15
      if (deltaMinutes !== 0) {
        const newEnd = computeResizedEnd(event.start, event.end, deltaMinutes)
        onEventResize(eventId, newEnd)
      } else {
        // Reset height
        eventBlock.style.height = ''
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }, [event, onEventResize])

  return (
    <div
      data-resize-event
      className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-transparent hover:bg-dr-text/20"
      onPointerDown={handlePointerDown}
    />
  )
}

export function DayView({ currentDate, events, onCreateEvent, onSelectEvent, onEventResize }: DayViewProps) {
  const [nowMinutes, setNowMinutes] = useState(() => getMadridHours(new Date()) * 60)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMinutes(getMadridHours(new Date()) * 60)
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll during drag
  useDndMonitor({
    onDragMove(event) {
      const container = scrollContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const y = (event.activatorEvent as PointerEvent)?.clientY
      if (y == null) return

      const currentY = y + (event.delta?.y ?? 0)

      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current)
        autoScrollRef.current = null
      }

      const scrollUp = currentY - rect.top < AUTO_SCROLL_ZONE
      const scrollDown = rect.bottom - currentY < AUTO_SCROLL_ZONE

      if (scrollUp || scrollDown) {
        const scroll = () => {
          if (!scrollContainerRef.current) return
          scrollContainerRef.current.scrollTop += scrollDown ? AUTO_SCROLL_SPEED : -AUTO_SCROLL_SPEED
          autoScrollRef.current = requestAnimationFrame(scroll)
        }
        autoScrollRef.current = requestAnimationFrame(scroll)
      }
    },
    onDragEnd() {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current)
        autoScrollRef.current = null
      }
    },
    onDragCancel() {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current)
        autoScrollRef.current = null
      }
    },
  })

  const todayStr = getMadridDateString(new Date())
  const dateStr = getMadridDateString(currentDate)
  const isToday = dateStr === todayStr

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: Event[] = []
    const timed: Event[] = []

    for (const event of events) {
      if (event.allDay || event.type === 'holiday') {
        const start = getAllDayDateString(event.start)
        const end = getAllDayDateString(event.end)
        if (dateStr >= start && dateStr <= end) {
          allDay.push(event)
        }
      } else {
        const evDate = getMadridDateString(new Date(event.start))
        if (evDate === dateStr) {
          timed.push(event)
        }
      }
    }

    return { allDayEvents: allDay, timedEvents: timed }
  }, [events, dateStr])

  const layoutEvents = useMemo(() => layoutOverlapping(timedEvents), [timedEvents])

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i)

  const headerFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIMEZONE,
  })

  return (
    <div className="flex h-full flex-col">
      {/* Day header */}
      <div className="border-b border-dr-border px-4 py-3">
        <h3 className={cn(
          'font-tactical text-lg uppercase tracking-widest',
          isToday ? 'text-dr-green' : 'text-dr-text'
        )}>
          {headerFmt.format(currentDate)}
        </h3>
      </div>

      {/* All-day strip */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b border-dr-border bg-dr-surface px-4 py-1">
          <span className="mr-4 self-center font-tactical text-xs uppercase tracking-wider text-dr-muted">
            Todo el día
          </span>
          <DroppableAllDayArea dateStr={dateStr}>
            {allDayEvents.map(event => {
              const isHoliday = event.type === 'holiday'
              const baseId = getBaseEventId(event)

              const eventEl = (
                <button
                  key={`${event.id}`}
                  onClick={() => onSelectEvent(event)}
                  className="truncate border-l-3 px-2 py-0.5 font-tactical text-xs uppercase text-dr-text"
                  style={{
                    borderLeftColor: event.color,
                    backgroundColor: `${event.color}1a`,
                  }}
                  title={event.title}
                >
                  {event.title}
                </button>
              )

              if (isHoliday) {
                return <span key={`${event.id}`}>{eventEl}</span>
              }

              return (
                <DraggableEvent
                  key={`${event.id}`}
                  eventId={baseId}
                  start={event.start}
                  end={event.end}
                  allDay={true}
                  sourceView="day"
                  title={event.title}
                  color={event.color}
                >
                  {eventEl}
                </DraggableEvent>
              )
            })}
          </DroppableAllDayArea>
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollContainerRef} className="flex flex-1 overflow-y-auto">
        {/* Time labels */}
        <div className="relative w-16 shrink-0">
          {hours.map(h => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 font-data text-xs text-dr-muted"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-mt-2">{h.toString().padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {/* Single day column */}
        <div
          className={cn(
            'relative flex-1 border-l border-dr-border',
            isToday && 'bg-dr-green/[0.03]'
          )}
          style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
        >
          {/* Half-hour droppable slots */}
          {hours.map(h => (
            <div key={h} style={{ height: HOUR_HEIGHT }}>
              <DroppableTimeSlot
                dateStr={dateStr}
                hour={h}
                half={0}
                onCreateEvent={onCreateEvent}
                day={currentDate}
              />
              <DroppableTimeSlot
                dateStr={dateStr}
                hour={h}
                half={1}
                onCreateEvent={onCreateEvent}
                day={currentDate}
              />
            </div>
          ))}

          {/* Current time indicator */}
          {isToday && (
            <div
              className="absolute left-0 right-0 z-20 border-t-2 border-dr-red"
              style={{
                top: (nowMinutes / 60) * HOUR_HEIGHT,
                boxShadow: '0 0 8px rgba(255, 51, 51, 0.5)',
              }}
            >
              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 bg-dr-red" />
            </div>
          )}

          {/* Events */}
          {layoutEvents.map(({ event, left, width }) => {
            const startHours = getMadridHours(new Date(event.start))
            const endHours = getMadridHours(new Date(event.end))
            const duration = Math.max(endHours - startHours, 0.5)
            const top = startHours * HOUR_HEIGHT
            const height = duration * HOUR_HEIGHT
            const isHoliday = event.type === 'holiday'
            const baseId = getBaseEventId(event)

            const eventContent = (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectEvent(event)
                }}
                className="h-full w-full overflow-hidden border-l-3 px-1 py-0.5 text-left text-xs"
                style={{
                  borderLeftColor: event.color,
                  backgroundColor: `${event.color}1a`,
                }}
                title={event.title}
              >
                <div className="truncate font-tactical text-xs uppercase text-dr-text">{event.title}</div>
                <div className="truncate font-data text-dr-secondary">
                  {event.type === 'reminder'
                    ? formatTime(new Date(event.start))
                    : `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`}
                </div>
              </button>
            )

            if (isHoliday) {
              return (
                <div
                  key={`${event.id}`}
                  className="absolute z-10"
                  style={{
                    top,
                    height: Math.max(height, HALF_HOUR_HEIGHT),
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                >
                  {eventContent}
                </div>
              )
            }

            return (
              <div
                key={`${event.id}`}
                className="absolute z-10"
                style={{
                  top,
                  height: Math.max(height, HALF_HOUR_HEIGHT),
                  left: `${left}%`,
                  width: `${width}%`,
                }}
              >
                <DraggableEvent
                  eventId={baseId}
                  start={event.start}
                  end={event.end}
                  allDay={false}
                  sourceView="day"
                  title={event.title}
                  color={event.color}
                  className="relative h-full"
                >
                  {eventContent}
                  {onEventResize && (
                    <ResizeHandle event={event} onEventResize={onEventResize} />
                  )}
                </DraggableEvent>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
