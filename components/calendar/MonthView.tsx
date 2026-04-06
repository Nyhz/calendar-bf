'use client'

import { useMemo } from 'react'
import type { Event } from '@/lib/db/schema'

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

function isToday(date: Date): boolean {
  return getMadridDateString(date) === getMadridDateString(new Date())
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
      const startDate = getEventDateString(event.start)
      const endDate = getEventDateString(event.end)

      // For multi-day / all-day events, add to each date in range
      if (event.allDay || startDate !== endDate) {
        const current = new Date(event.start)
        const endDt = new Date(event.end)
        while (current <= endDt) {
          const key = getMadridDateString(current)
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(event)
          current.setDate(current.getDate() + 1)
        }
      } else {
        if (!map.has(startDate)) map.set(startDate, [])
        map.get(startDate)!.push(event)
      }
    }
    return map
  }, [events])

  return (
    <div className="flex h-full flex-col">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {DAY_NAMES.map(name => (
          <div
            key={name}
            className="py-2 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
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
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
          const overflowCount = dayEvents.length - MAX_VISIBLE_EVENTS

          return (
            <div
              key={i}
              className="flex min-h-24 cursor-pointer flex-col border-b border-r border-gray-200 p-1 dark:border-gray-700"
              onClick={() => {
                onCreateEvent(day)
              }}
            >
              <span
                className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  today
                    ? 'bg-blue-500 font-bold text-white'
                    : isCurrentMonth
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-400 dark:text-gray-600'
                }`}
              >
                {day.getDate()}
              </span>

              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {visibleEvents.map(event => (
                  <button
                    key={`${event.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectEvent(event)
                    }}
                    className={`truncate rounded px-1 text-left text-xs leading-5 text-white ${
                      event.allDay || event.type === 'holiday' ? 'w-full' : ''
                    }`}
                    style={{ backgroundColor: event.color }}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
                {overflowCount > 0 && (
                  <button
                    className="text-left text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
        })}
      </div>
    </div>
  )
}
