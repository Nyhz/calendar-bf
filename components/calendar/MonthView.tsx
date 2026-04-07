'use client'

import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/components/ui/utils'
import type { Event } from '@/lib/db/schema'
import DraggableEvent from './DraggableEvent'
import type { CalendarDropData } from '@/lib/dnd'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

type MonthViewProps = {
  currentDate: Date
  events: Event[]
  onCreateEvent: (date: Date) => void
  onSelectEvent: (event: Event) => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_VISIBLE_EVENTS = 3

function getMadridDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
}

function getEventDateString(isoString: string): string {
  return getMadridDateString(new Date(isoString))
}

function getAllDayDateString(isoString: string): string {
  return isoString.substring(0, 10)
}

function isToday(date: Date): boolean {
  return getMadridDateString(date) === getMadridDateString(new Date())
}

/** Extract the base numeric id from a potentially composite recurring id like "5_2025-04-07" */
function getBaseEventId(id: number | string): number {
  const str = String(id)
  const underscoreIdx = str.indexOf('_')
  return underscoreIdx >= 0 ? Number(str.substring(0, underscoreIdx)) : Number(str)
}

type DroppableDayCellProps = {
  dateKey: string
  day: Date
  dayEvents: Event[]
  isCurrentMonth: boolean
  isToday: boolean
  onCreateEvent: (date: Date) => void
  onSelectEvent: (event: Event) => void
}

function DroppableDayCell({
  dateKey,
  day,
  dayEvents,
  isCurrentMonth,
  isToday: today,
  onCreateEvent,
  onSelectEvent,
}: DroppableDayCellProps) {
  const dropData: CalendarDropData = { date: dateKey, time: null, view: 'month' }
  const { setNodeRef, isOver } = useDroppable({
    id: `month-day-${dateKey}`,
    data: dropData,
  })

  const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
  const overflowCount = dayEvents.length - MAX_VISIBLE_EVENTS

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-24 cursor-pointer flex-col border-b border-r border-dr-border p-1 transition-colors',
        isCurrentMonth ? 'bg-transparent' : 'bg-dr-bg/60',
        isOver
          ? 'bg-blue-100/40 dark:bg-blue-900/30'
          : 'hover:bg-dr-hover'
      )}
      onClick={() => {
        onCreateEvent(day)
      }}
    >
      <div className="mb-1 flex justify-end">
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center font-data text-xs',
            today
              ? 'bg-dr-green font-bold text-dr-bg'
              : isCurrentMonth
                ? 'text-dr-secondary'
                : 'text-dr-dim'
          )}
        >
          {day.getDate()}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        {visibleEvents.map(event => {
          const isFullWidth = event.allDay || event.type === 'holiday'
          const isHoliday = event.type === 'holiday'
          const eventChip = (
            <button
              key={`${event.id}`}
              onClick={(e) => {
                e.stopPropagation()
                onSelectEvent(event)
              }}
              className={cn(
                'group truncate border-l-[3px] px-1.5 text-left font-mono text-xs leading-5 text-dr-text transition-shadow',
                isFullWidth ? 'w-full' : ''
              )}
              style={{
                borderLeftColor: event.color,
                backgroundColor: `${event.color}1a`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 12px ${event.color}40`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
              title={event.title}
            >
              {event.title}
            </button>
          )

          if (isHoliday) {
            return <div key={`${event.id}`}>{eventChip}</div>
          }

          return (
            <DraggableEvent
              key={`${event.id}`}
              eventId={getBaseEventId(event.id)}
              start={event.start}
              end={event.end}
              allDay={!!event.allDay}
              sourceView="month"
            >
              {eventChip}
            </DraggableEvent>
          )
        })}
        {overflowCount > 0 && (
          <button
            className="text-left font-tactical text-xs uppercase text-dr-green hover:text-dr-green/80"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            +{overflowCount} more
          </button>
        )}
      </div>
    </div>
  )
}

export function MonthView({ currentDate, events, onCreateEvent, onSelectEvent }: MonthViewProps) {
  const { days, currentMonth } = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const dayOfWeek = firstOfMonth.getDay()
    // Monday = 0 offset. Sunday (0) -> offset 6, Monday (1) -> offset 0, etc.
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const startDate = new Date(year, month, 1 - mondayOffset)

    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      days.push(d)
    }

    return { days, currentMonth: month }
  }, [currentDate])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const event of events) {
      const isAllDay = event.allDay || event.type === 'holiday'
      const startDate = isAllDay ? getAllDayDateString(event.start) : getEventDateString(event.start)
      const endDate = isAllDay ? getAllDayDateString(event.end) : getEventDateString(event.end)

      // For multi-day / all-day events, add to each date in range
      if (event.allDay || startDate !== endDate) {
        const current = new Date(startDate + 'T12:00:00Z')
        const endKey = endDate
        let key = startDate
        while (key <= endKey) {
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(event)
          current.setDate(current.getDate() + 1)
          key = current.toISOString().substring(0, 10)
        }
      } else {
        if (!map.has(startDate)) map.set(startDate, [])
        map.get(startDate)!.push(event)
      }
    }
    return map
  }, [events])

  return (
    <div className="flex h-full flex-col bg-dr-bg">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-dr-border">
        {DAY_NAMES.map(name => (
          <div
            key={name}
            className="py-2 text-center font-tactical text-xs uppercase tracking-widest text-dr-dim"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const dateKey = getMadridDateString(day)
          const dayEvents = eventsByDate.get(dateKey) ?? []
          const isCurrentMonth = day.getMonth() === currentMonth
          const today = isToday(day)

          return (
            <DroppableDayCell
              key={i}
              dateKey={dateKey}
              day={day}
              dayEvents={dayEvents}
              isCurrentMonth={isCurrentMonth}
              isToday={today}
              onCreateEvent={onCreateEvent}
              onSelectEvent={onSelectEvent}
            />
          )
        })}
      </div>
    </div>
  )
}
