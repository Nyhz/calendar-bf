'use client'

import { useMemo } from 'react'
import type { Event } from '@/lib/db/schema'
import { cn } from '@/components/ui/utils'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

type AgendaViewProps = {
  currentDate: Date
  events: Event[]
  onSelectEvent: (event: Event) => void
}

function getMadridDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
}

function getAllDayDateString(isoString: string): string {
  return isoString.substring(0, 10)
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDateHeader(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
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
        const isAllDay = event.allDay || event.type === 'holiday'
        const startDate = isAllDay ? getAllDayDateString(event.start) : getMadridDateString(new Date(event.start))
        const endDate = isAllDay ? getAllDayDateString(event.end) : getMadridDateString(new Date(event.end))
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
      <div className="flex h-full items-center justify-center bg-dr-bg p-4">
        <span className="font-tactical text-sm uppercase tracking-widest text-dr-muted">
          No events scheduled
        </span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-dr-bg p-4">
      {grouped.map(({ date, events: dayEvents }) => (
        <div key={getMadridDateString(date)} className="mb-6">
          <h3 className="mb-2 border-b border-dr-border pb-1 font-tactical text-sm uppercase tracking-widest text-dr-green">
            {formatDateHeader(date)}
          </h3>
          <div className="space-y-1">
            {dayEvents.map(event => (
              <button
                key={`${event.id}`}
                onClick={() => onSelectEvent(event)}
                className={cn(
                  'flex w-full items-center gap-3 border border-dr-border bg-dr-surface px-3 py-2 text-left',
                  'transition-colors hover:bg-dr-hover hover:border-dr-border-hover hover:shadow-[0_0_8px_rgba(0,255,65,0.1)]'
                )}
              >
                <span
                  className="h-3 w-3 shrink-0"
                  style={{
                    backgroundColor: event.color,
                    boxShadow: `0 0 6px ${event.color}60`,
                  }}
                />
                <span className="w-28 shrink-0 font-data text-sm text-dr-secondary">
                  {event.allDay || event.type === 'holiday'
                    ? 'All day'
                    : event.type === 'reminder'
                      ? formatTime(new Date(event.start))
                      : `${formatTime(new Date(event.start))} – ${formatTime(new Date(event.end))}`}
                </span>
                <span className="truncate font-tactical text-sm text-dr-text">
                  {event.title}
                </span>
                {event.location && (
                  <span className="ml-auto truncate font-data text-xs text-dr-muted">
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
