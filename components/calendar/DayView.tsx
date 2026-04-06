'use client'

import { useMemo, useEffect, useState } from 'react'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'
const HOUR_HEIGHT = 48
const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2
const TOTAL_HOURS = 24

type DayViewProps = {
  currentDate: Date
  events: Event[]
  onCreateEvent: (date: Date) => void
  onSelectEvent: (event: Event) => void
}

function getMadridDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
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
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
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

export function DayView({ currentDate, events, onCreateEvent, onSelectEvent }: DayViewProps) {
  const [nowMinutes, setNowMinutes] = useState(() => getMadridHours(new Date()) * 60)

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMinutes(getMadridHours(new Date()) * 60)
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const todayStr = getMadridDateString(new Date())
  const dateStr = getMadridDateString(currentDate)
  const isToday = dateStr === todayStr

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: Event[] = []
    const timed: Event[] = []

    for (const event of events) {
      if (event.allDay || event.type === 'holiday') {
        const start = getMadridDateString(new Date(event.start))
        const end = getMadridDateString(new Date(event.end))
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

  const headerFmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIMEZONE,
  })

  return (
    <div className="flex h-full flex-col">
      {/* Day header */}
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-lg font-semibold capitalize text-gray-900 dark:text-gray-100">
          {headerFmt.format(currentDate)}
        </h3>
      </div>

      {/* All-day strip */}
      {allDayEvents.length > 0 && (
        <div className="flex border-b border-gray-200 px-4 py-1 dark:border-gray-700">
          <span className="mr-4 self-center text-xs text-gray-500 dark:text-gray-400">
            Todo el día
          </span>
          <div className="flex flex-1 flex-wrap gap-1">
            {allDayEvents.map(event => (
              <button
                key={`${event.id}`}
                onClick={() => onSelectEvent(event)}
                className="truncate rounded px-2 py-0.5 text-xs text-white"
                style={{ backgroundColor: event.color }}
                title={event.title}
              >
                {event.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex flex-1 overflow-y-auto">
        {/* Time labels */}
        <div className="relative w-16 shrink-0">
          {hours.map(h => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 text-xs text-gray-500 dark:text-gray-400"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-mt-2">{h.toString().padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {/* Single day column */}
        <div
          className={`relative flex-1 border-l border-gray-200 dark:border-gray-700 ${
            isToday ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
          }`}
          style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
        >
          {/* Hour grid lines */}
          {hours.map(h => (
            <div
              key={h}
              className="border-b border-gray-100 dark:border-gray-800"
              style={{ height: HOUR_HEIGHT }}
              onClick={() => {
                const d = new Date(currentDate)
                d.setHours(h, 0, 0, 0)
                onCreateEvent(d)
              }}
            />
          ))}

          {/* Current time indicator */}
          {isToday && (
            <div
              className="absolute left-0 right-0 z-20 border-t-2 border-red-500"
              style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
            >
              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          )}

          {/* Events */}
          {layoutEvents.map(({ event, left, width }) => {
            const startHours = getMadridHours(new Date(event.start))
            const endHours = getMadridHours(new Date(event.end))
            const duration = Math.max(endHours - startHours, 0.5)
            const top = startHours * HOUR_HEIGHT
            const height = duration * HOUR_HEIGHT

            return (
              <button
                key={`${event.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectEvent(event)
                }}
                className="absolute z-10 overflow-hidden rounded px-1 py-0.5 text-left text-xs text-white"
                style={{
                  backgroundColor: event.color,
                  top,
                  height: Math.max(height, HALF_HOUR_HEIGHT),
                  left: `${left}%`,
                  width: `${width}%`,
                }}
                title={event.title}
              >
                <div className="truncate font-medium">{event.title}</div>
                <div className="truncate opacity-90">
                  {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
