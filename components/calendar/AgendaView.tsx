'use client'

import { useMemo } from 'react'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

type AgendaViewProps = {
  currentDate: Date
  events: Event[]
  onSelectEvent: (event: Event) => void
}

function getMadridDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDateHeader(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIMEZONE,
  }).format(date)
}

export function AgendaView({ currentDate, events, onSelectEvent }: AgendaViewProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; events: Event[] }>()

    // Generate 30 days
    for (let i = 0; i < 30; i++) {
      const d = new Date(currentDate)
      d.setDate(currentDate.getDate() + i)
      const key = getMadridDateString(d)

      const dayEvents = events.filter(event => {
        const startDate = getMadridDateString(new Date(event.start))
        const endDate = getMadridDateString(new Date(event.end))
        // Event spans this day
        return key >= startDate && key <= endDate
      })

      if (dayEvents.length > 0) {
        map.set(key, { date: d, events: dayEvents })
      }
    }

    return Array.from(map.values())
  }, [currentDate, events])

  if (grouped.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
        No hay eventos en los próximos 30 días
      </div>
    )
  }

  return (
    <div className="overflow-y-auto p-4">
      {grouped.map(({ date, events: dayEvents }) => (
        <div key={getMadridDateString(date)} className="mb-6">
          <h3 className="mb-2 text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">
            {formatDateHeader(date)}
          </h3>
          <div className="space-y-1">
            {dayEvents.map(event => (
              <button
                key={`${event.id}`}
                onClick={() => onSelectEvent(event)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color }}
                />
                <span className="w-28 shrink-0 text-sm text-gray-500 dark:text-gray-400">
                  {event.allDay || event.type === 'holiday'
                    ? 'Todo el día'
                    : `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`}
                </span>
                <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {event.title}
                </span>
                {event.location && (
                  <span className="ml-auto truncate text-xs text-gray-400 dark:text-gray-500">
                    {event.location}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
