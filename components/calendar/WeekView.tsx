'use client'

import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { useDroppable, useDndMonitor } from '@dnd-kit/core'
import DraggableEvent from './DraggableEvent'
import { computeResizedEnd } from '@/lib/dnd'
import type { CalendarDropData } from '@/lib/dnd'
import { cn } from '@/components/ui/utils'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'
const HOUR_HEIGHT = 48 // px per hour
const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2
const TOTAL_HOURS = 24
const SNAP_MINUTES = 15
const PX_PER_MINUTE = HOUR_HEIGHT / 60

type WeekViewProps = {
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

function getWeekDays(date: Date): Date[] {
  const dow = date.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(date)
  monday.setDate(date.getDate() + mondayOffset)

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d)
  }
  return days
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

/** Extract base numeric id for recurring events (e.g. "42_2025-04-07" -> 42) */
function getBaseEventId(id: number | string): number {
  const str = String(id)
  const underscoreIdx = str.indexOf('_')
  return underscoreIdx > -1 ? parseInt(str.substring(0, underscoreIdx)) : Number(id)
}

// --- Droppable slot component (hooks must be called inside a component) ---

function DroppableTimeSlot({
  dateStr,
  hour,
  half,
  isToday,
  day,
  onCreateEvent,
}: {
  dateStr: string
  hour: number
  half: 0 | 1
  isToday: boolean
  day: Date
  onCreateEvent: (date: Date) => void
}) {
  const minutes = half === 0 ? '00' : '30'
  const timeStr = `${hour.toString().padStart(2, '0')}:${minutes}`
  const droppableId = `week-slot-${dateStr}-${timeStr}`

  const dropData: CalendarDropData = {
    date: dateStr,
    time: timeStr,
    view: 'week',
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
        half === 0 && 'border-t border-t-dr-border',
        isOver && 'bg-dr-green/10',
        isToday && !isOver && 'bg-dr-green/[0.03]'
      )}
      style={{ height: HALF_HOUR_HEIGHT }}
      onClick={() => {
        const d = new Date(day)
        d.setHours(hour, half * 30, 0, 0)
        onCreateEvent(d)
      }}
    />
  )
}

// --- Droppable all-day cell ---

function DroppableAllDayCell({
  dateStr,
  dayIndex,
  children,
}: {
  dateStr: string
  dayIndex: number
  children: React.ReactNode
}) {
  const dropData: CalendarDropData = {
    date: dateStr,
    time: null,
    view: 'week',
  }

  const { setNodeRef, isOver } = useDroppable({
    id: `week-allday-${dateStr}`,
    data: dropData,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-1 flex-col gap-0.5 border-r border-dr-border p-0.5',
        dayIndex === 6 && 'border-r-0',
        isOver && 'bg-dr-green/10'
      )}
    >
      {children}
    </div>
  )
}

// --- Resize handle ---

function ResizeHandle({
  event,
  onEventResize,
}: {
  event: Event
  onEventResize: (eventId: number, newEnd: string) => Promise<void>
}) {
  const handleRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const startY = e.clientY
      const eventId = getBaseEventId(event.id)

      // Find the event block element (parent of the resize handle)
      const eventBlock = handleRef.current?.parentElement
      if (!eventBlock) return

      const originalHeight = eventBlock.offsetHeight

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY
        const deltaMinutes = deltaY / PX_PER_MINUTE
        // Snap to 15-minute increments
        const snappedMinutes = Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES
        const snappedDeltaPx = snappedMinutes * PX_PER_MINUTE

        // Enforce minimum height (15 min)
        const minHeight = SNAP_MINUTES * PX_PER_MINUTE
        const newHeight = Math.max(originalHeight + snappedDeltaPx, minHeight)
        eventBlock.style.height = `${newHeight}px`
      }

      const handlePointerUp = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)

        const deltaY = upEvent.clientY - startY
        const deltaMinutes = deltaY / PX_PER_MINUTE
        const snappedMinutes = Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES

        if (snappedMinutes !== 0) {
          const newEnd = computeResizedEnd(event.start, event.end, snappedMinutes)
          onEventResize(eventId, newEnd)
        } else {
          // Reset height
          eventBlock.style.height = ''
        }
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [event, onEventResize]
  )

  return (
    <div
      ref={handleRef}
      onPointerDown={handlePointerDown}
      className="absolute bottom-0 left-0 right-0 z-20 h-1.5 cursor-ns-resize bg-transparent hover:bg-dr-green/30"
    />
  )
}

// --- Auto-scroll hook ---

function useAutoScrollOnDrag(containerRef: React.RefObject<HTMLDivElement | null>) {
  const rafRef = useRef<number | null>(null)
  const pointerYRef = useRef<number>(0)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      pointerYRef.current = e.clientY
    }

    const tick = () => {
      if (!isDraggingRef.current || !containerRef.current) {
        rafRef.current = null
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const y = pointerYRef.current
      const edgeZone = 50

      if (y < rect.top + edgeZone && y > rect.top) {
        const intensity = 1 - (y - rect.top) / edgeZone
        containerRef.current.scrollBy(0, -10 * intensity)
      } else if (y > rect.bottom - edgeZone && y < rect.bottom) {
        const intensity = 1 - (rect.bottom - y) / edgeZone
        containerRef.current.scrollBy(0, 10 * intensity)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    document.addEventListener('pointermove', handlePointerMove)

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef])

  useDndMonitor({
    onDragStart() {
      isDraggingRef.current = true
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(function tick() {
          if (!isDraggingRef.current || !containerRef.current) {
            rafRef.current = null
            return
          }

          const rect = containerRef.current.getBoundingClientRect()
          const y = pointerYRef.current
          const edgeZone = 50

          if (y < rect.top + edgeZone && y > rect.top) {
            const intensity = 1 - (y - rect.top) / edgeZone
            containerRef.current.scrollBy(0, -10 * intensity)
          } else if (y > rect.bottom - edgeZone && y < rect.bottom) {
            const intensity = 1 - (rect.bottom - y) / edgeZone
            containerRef.current.scrollBy(0, 10 * intensity)
          }

          rafRef.current = requestAnimationFrame(tick)
        })
      }
    },
    onDragEnd() {
      isDraggingRef.current = false
    },
    onDragCancel() {
      isDraggingRef.current = false
    },
  })
}

// --- Main component ---

export function WeekView({ currentDate, events, onCreateEvent, onSelectEvent, onEventResize }: WeekViewProps) {
  const [nowMinutes, setNowMinutes] = useState(() => getMadridHours(new Date()) * 60)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useAutoScrollOnDrag(scrollContainerRef)

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMinutes(getMadridHours(new Date()) * 60)
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate])

  const todayStr = getMadridDateString(new Date())

  const { allDayEvents, timedEventsByDay } = useMemo(() => {
    const allDay: Event[] = []
    const timed = new Map<string, Event[]>()

    for (const day of weekDays) {
      timed.set(getMadridDateString(day), [])
    }

    for (const event of events) {
      if (event.allDay || event.type === 'holiday') {
        allDay.push(event)
        continue
      }
      const dateKey = getMadridDateString(new Date(event.start))
      if (timed.has(dateKey)) {
        timed.get(dateKey)!.push(event)
      }
    }

    return { allDayEvents: allDay, timedEventsByDay: timed }
  }, [events, weekDays])

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i)
  const dayNameFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TIMEZONE })
  const dayNumFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: TIMEZONE })

  const noopResize = useCallback(async () => {}, [])
  const resizeHandler = onEventResize ?? noopResize

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div className="flex border-b border-dr-border">
        <div className="w-16 shrink-0" />
        {weekDays.map((day, i) => {
          const dateStr = getMadridDateString(day)
          const isToday = dateStr === todayStr
          return (
            <div
              key={i}
              className={cn(
                'flex-1 py-2 text-center',
                isToday && 'bg-dr-green/5'
              )}
            >
              <div className={cn(
                'font-tactical text-xs uppercase tracking-widest',
                isToday ? 'text-dr-green' : 'text-dr-secondary'
              )}>
                {dayNameFmt.format(day)}
              </div>
              <div
                className={cn(
                  'mx-auto mt-0.5 flex h-8 w-8 items-center justify-center font-data text-sm font-semibold',
                  isToday ? 'bg-dr-green text-dr-bg' : 'text-dr-text'
                )}
              >
                {dayNumFmt.format(day)}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day strip */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b border-dr-border bg-dr-surface">
          <div className="flex w-16 shrink-0 items-center justify-center font-tactical text-xs uppercase tracking-wider text-dr-muted">
            All day
          </div>
          <div className="flex flex-1">
            {weekDays.map((day, i) => {
              const dateStr = getMadridDateString(day)
              const dayAllDay = allDayEvents.filter(e => {
                const start = getAllDayDateString(e.start)
                const end = getAllDayDateString(e.end)
                return dateStr >= start && dateStr <= end
              })
              return (
                <DroppableAllDayCell key={i} dateStr={dateStr} dayIndex={i}>
                  {dayAllDay.map(event => {
                    const isHoliday = event.type === 'holiday'
                    const eventButton = (
                      <button
                        onClick={() => onSelectEvent(event)}
                        className="truncate border-l-3 px-1 text-left font-tactical text-xs uppercase leading-5 text-dr-text"
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
                      return <div key={`${event.id}`}>{eventButton}</div>
                    }

                    return (
                      <DraggableEvent
                        key={`${event.id}`}
                        eventId={getBaseEventId(event.id)}
                        start={event.start}
                        end={event.end}
                        allDay={true}
                        sourceView="week"
                      >
                        {eventButton}
                      </DraggableEvent>
                    )
                  })}
                </DroppableAllDayCell>
              )
            })}
          </div>
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

        {/* Day columns */}
        <div className="relative flex flex-1">
          {weekDays.map((day, dayIndex) => {
            const dateStr = getMadridDateString(day)
            const isToday = dateStr === todayStr
            const dayEvents = timedEventsByDay.get(dateStr) ?? []
            const layoutEvents = layoutOverlapping(dayEvents)

            return (
              <div
                key={dayIndex}
                className="relative flex-1 border-r border-dr-border"
                style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
              >
                {/* Half-hour droppable slots */}
                {hours.map(h => (
                  <div key={h}>
                    <DroppableTimeSlot
                      dateStr={dateStr}
                      hour={h}
                      half={0}
                      isToday={isToday}
                      day={day}
                      onCreateEvent={onCreateEvent}
                    />
                    <DroppableTimeSlot
                      dateStr={dateStr}
                      hour={h}
                      half={1}
                      isToday={isToday}
                      day={day}
                      onCreateEvent={onCreateEvent}
                    />
                  </div>
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-dr-red"
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
                  const height = Math.max(duration * HOUR_HEIGHT, HALF_HOUR_HEIGHT)
                  const isHoliday = event.type === 'holiday'
                  const baseId = getBaseEventId(event.id)

                  const eventContent = (
                    <div
                      className="relative h-full overflow-hidden border-l-3 px-1 py-0.5 text-left text-xs"
                      style={{
                        borderLeftColor: event.color,
                        backgroundColor: `${event.color}1a`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectEvent(event)
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          onSelectEvent(event)
                        }
                      }}
                      title={event.title}
                    >
                      <div className="truncate font-tactical text-xs uppercase text-dr-text">{event.title}</div>
                      <div className="truncate font-data text-dr-secondary">
                        {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))}
                      </div>
                      {/* Resize handle */}
                      {!isHoliday && onEventResize && (
                        <ResizeHandle event={event} onEventResize={resizeHandler} />
                      )}
                    </div>
                  )

                  if (isHoliday) {
                    return (
                      <div
                        key={`${event.id}`}
                        className="absolute z-10"
                        style={{
                          top,
                          height,
                          left: `${left}%`,
                          width: `${width}%`,
                        }}
                      >
                        {eventContent}
                      </div>
                    )
                  }

                  return (
                    <DraggableEvent
                      key={`${event.id}`}
                      eventId={baseId}
                      start={event.start}
                      end={event.end}
                      allDay={false}
                      sourceView="week"
                      className="absolute z-10"
                      style={{
                        top,
                        height,
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                    >
                      {eventContent}
                    </DraggableEvent>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
