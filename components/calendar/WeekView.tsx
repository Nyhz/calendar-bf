'use client'

import { useMemo, useEffect, useState } from 'react'
import { cn } from '@/components/ui/utils'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'
const HOUR_HEIGHT = 48 // px per hour
const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2
const TOTAL_HOURS = 24
const SLOT_MINUTES = 30

type WeekViewProps = {
  currentDate: Date
  events: Event[]
  onCreateEvent: (date: Date) => void
  onSelectEvent: (event: Event) => void
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

export function WeekView({ currentDate, events, onCreateEvent, onSelectEvent }: WeekViewProps) {
  const [nowMinutes, setNowMinutes] = useState(() => getMadridHours(new Date()) * 60)

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
                <div key={i} className={cn(
                  'flex flex-1 flex-col gap-0.5 border-r border-dr-border p-0.5',
                  i === 6 && 'border-r-0'
                )}>
                  {dayAllDay.map(event => (
                    <button
                      key={`${event.id}`}
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
                  ))}
                </div>
              )
            })}
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
                className={cn(
                  'relative flex-1 border-r border-dr-border',
                  isToday && 'bg-dr-green/[0.03]'
                )}
                style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
              >
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="cursor-pointer border-b border-dr-border hover:bg-dr-hover"
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => {
                      const d = new Date(day)
                      d.setHours(h, 0, 0, 0)
                      onCreateEvent(d)
                    }}
                  />
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

                  return (
                    <button
                      key={`${event.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectEvent(event)
                      }}
                      className="absolute z-10 overflow-hidden border-l-3 px-1 py-0.5 text-left text-xs"
                      style={{
                        borderLeftColor: event.color,
                        backgroundColor: `${event.color}1a`,
                        top,
                        height: Math.max(height, HALF_HOUR_HEIGHT),
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                      title={event.title}
                    >
                      <div className="truncate font-tactical text-xs uppercase text-dr-text">{event.title}</div>
                      <div className="truncate font-data text-dr-secondary">
                        {formatTime(new Date(event.start))} – {formatTime(new Date(event.end))}
                      </div>
                    </button>
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
