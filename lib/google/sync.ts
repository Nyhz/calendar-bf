// lib/google/sync.ts
import { google, type calendar_v3 } from 'googleapis'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { events, googleCalendars, integrations, type GoogleCalendar } from '../db/schema'
import { getAuthedClient } from './client'
import { mapGoogleEvent } from './mapper'

let inflight = false

export class NotConnectedError extends Error {}
export class AlreadySyncingError extends Error {}

const INITIAL_LOAD_MONTHS_BACK = 6
const INITIAL_LOAD_MONTHS_FORWARD = 12

export async function syncGoogleCalendars(calendarIds?: string[]): Promise<{ errors: string[] }> {
  if (inflight) throw new AlreadySyncingError('Sync already in progress')
  inflight = true
  const errors: string[] = []

  try {
    const auth = await getAuthedClient().catch(() => null)
    if (!auth) throw new NotConnectedError()

    const api = google.calendar({ version: 'v3', auth })

    let targets: GoogleCalendar[]
    if (calendarIds) {
      targets = []
      for (const id of calendarIds) {
        const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, id))
        if (cal) targets.push(cal)
      }
    } else {
      targets = await db.select().from(googleCalendars).where(eq(googleCalendars.enabled, 1))
    }

    for (const cal of targets) {
      try {
        await syncOneCalendar(api, cal)
      } catch (e) {
        const msg = `[${cal.id}] ${(e as Error).message}`
        errors.push(msg)
        console.error('[google-sync]', msg)
      }
    }

    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastSyncError: errors.length > 0 ? errors.join('; ') : null,
      })
      .where(eq(integrations.provider, 'google'))

    return { errors }
  } finally {
    inflight = false
  }
}

async function syncOneCalendar(
  api: calendar_v3.Calendar,
  cal: GoogleCalendar,
): Promise<void> {
  let syncToken = cal.syncToken
  let pageToken: string | undefined

  while (true) {
    let res
    try {
      res = await api.events.list({
        calendarId: cal.id,
        ...(syncToken
          ? { syncToken, pageToken }
          : {
              timeMin: monthsFromNow(-INITIAL_LOAD_MONTHS_BACK),
              timeMax: monthsFromNow(INITIAL_LOAD_MONTHS_FORWARD),
              singleEvents: false,
              pageToken,
            }),
      })
    } catch (e) {
      const code = (e as { code?: number }).code
      if (code === 410 && syncToken) {
        // Sync token expired — clear and retry as initial load
        syncToken = null
        pageToken = undefined
        await db.update(googleCalendars).set({ syncToken: null }).where(eq(googleCalendars.id, cal.id))
        continue
      }
      throw e
    }

    const items = res.data.items ?? []
    for (const g of items) {
      if (!g.id) continue
      if (g.status === 'cancelled') {
        await db
          .delete(events)
          .where(and(eq(events.googleCalendarId, cal.id), eq(events.googleEventId, g.id)))
      } else {
        const row = mapGoogleEvent(g, cal)
        // Use SELECT + INSERT/UPDATE to avoid issues with Drizzle resolving
        // the partial unique index (google_calendar_id, google_event_id WHERE google_event_id IS NOT NULL)
        const [existing] = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.googleCalendarId, cal.id),
              eq(events.googleEventId, g.id),
            ),
          )
        if (existing) {
          await db
            .update(events)
            .set({
              title: row.title,
              start: row.start,
              end: row.end,
              allDay: row.allDay,
              description: row.description,
              location: row.location,
              recurrence: row.recurrence,
              color: row.color,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(events.id, existing.id))
        } else {
          await db.insert(events).values(row)
        }
      }
    }

    if (res.data.nextPageToken) {
      pageToken = res.data.nextPageToken
      continue
    }
    if (res.data.nextSyncToken) {
      await db
        .update(googleCalendars)
        .set({ syncToken: res.data.nextSyncToken, lastSyncAt: new Date().toISOString() })
        .where(eq(googleCalendars.id, cal.id))
    }
    break
  }
}

function monthsFromNow(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}
