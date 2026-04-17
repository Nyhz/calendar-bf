// lib/google/mapper.ts
import type { calendar_v3 } from 'googleapis'
import type { NewEvent, GoogleCalendar } from '../db/schema'
import { TYPE_COLORS } from '../db/schema'

const SIMPLE_RRULE = /^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/i

export function mapRecurrence(rules: string[] | undefined | null): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' {
  if (!rules || rules.length === 0) return 'none'
  const rrule = rules.find(r => r.startsWith('RRULE:'))
  if (!rrule) return 'none'
  const m = rrule.match(SIMPLE_RRULE)
  if (!m) return 'none'
  return m[1].toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly'
}

export function mapGoogleEvent(
  g: calendar_v3.Schema$Event,
  cal: GoogleCalendar,
): NewEvent {
  const hasDate = !!g.start?.date
  const startISO = hasDate
    ? new Date(`${g.start!.date}T00:00:00Z`).toISOString()
    : new Date(g.start!.dateTime!).toISOString()
  const endISO = hasDate
    ? new Date(`${g.start!.date}T23:59:59Z`).toISOString()
    : new Date(g.end!.dateTime!).toISOString()

  return {
    title: (g.summary && g.summary.trim()) || '(no title)',
    description: g.description ?? null,
    location: g.location ?? null,
    start: startISO,
    end: endISO,
    allDay: hasDate ? 1 : 0,
    type: 'event',
    source: 'google',
    color: cal.backgroundColor ?? TYPE_COLORS.event,
    recurrence: mapRecurrence(g.recurrence ?? undefined),
    region: null,
    googleEventId: g.id ?? null,
    googleCalendarId: cal.id,
  }
}
