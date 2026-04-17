# Google Calendar Sync + Settings Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-way Google Calendar sync and a `/settings` page that centralises integrations, daily-summary, and appearance configuration.

**Architecture:** New `integrations` + `google_calendars` + `app_settings` tables. `events` gets `source`, `googleEventId`, `googleCalendarId` columns. OAuth consent via localhost redirect (user runs it once from the host machine). Sync runs daily via `node-cron` and on-demand from a "Sync now" button. Events from Google are mirrored into `events` with `source='google'` and are read-only at the API (PATCH/DELETE → 403). Calendar-level show/hide is a client-side filter in the sidebar.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + better-sqlite3, `googleapis` npm package, `node-cron`, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-17-google-calendar-sync-and-settings-design.md`

---

## File structure

**New files:**
- `lib/db/schema.ts` — adds tables, extends `events`
- `lib/db/migrations/0001_google_calendar.sql` — generated
- `lib/settings.ts` — typed get/set over `app_settings`
- `lib/google/client.ts` — OAuth2 client + token refresh
- `lib/google/mapper.ts` — Google event → `NewEvent`, RRULE mapping
- `lib/google/sync.ts` — `syncGoogleCalendars()`
- `lib/google/mapper.test.ts` — Vitest
- `lib/google/sync.test.ts` — Vitest
- `app/api/settings/route.ts`
- `app/api/integrations/google/route.ts` (GET status, DELETE disconnect)
- `app/api/integrations/google/authorize/route.ts`
- `app/api/integrations/google/callback/route.ts`
- `app/api/integrations/google/sync/route.ts`
- `app/api/integrations/google/calendars/[id]/route.ts`
- `app/settings/page.tsx`
- `components/settings/IntegrationsCard.tsx`
- `components/settings/SummaryCard.tsx`
- `components/settings/AppearanceCard.tsx`

**Modified files:**
- `app/api/events/route.ts` — GET returns Google events; POST unchanged
- `app/api/events/[id]/route.ts` — PATCH/DELETE 403 when `source !== 'local'`
- `components/calendar/Sidebar.tsx` — Google calendars section
- `components/calendar/CalendarShell.tsx` — read theme + default view from `app_settings`
- `lib/cron.ts` — Google sync job; summary job reads time from `app_settings`
- `.env.local.example` — new OAuth vars
- `README.md` — one-time Google Cloud setup section

---

## Task 1: Install `googleapis` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install googleapis@latest
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add googleapis for Google Calendar sync"
```

---

## Task 2: Extend schema with new tables + `events` source columns

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0001_*.sql` (generated)

- [ ] **Step 1: Add new tables and extend `events`**

Append to `lib/db/schema.ts` (and add the three columns to the existing `events` definition):

```ts
// In the existing events table, add:
//   source: text('source').notNull().default('local'),
//   googleEventId: text('google_event_id'),
//   googleCalendarId: text('google_calendar_id'),

export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().unique(),
  accountEmail: text('account_email').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessExpiresAt: text('access_expires_at'),
  scopes: text('scopes').notNull(),
  connectedAt: text('connected_at').notNull().default(sql`(datetime('now'))`),
  lastSyncAt: text('last_sync_at'),
  lastSyncError: text('last_sync_error'),
})

export const googleCalendars = sqliteTable('google_calendars', {
  id: text('id').primaryKey(),
  summary: text('summary').notNull(),
  backgroundColor: text('background_color'),
  enabled: integer('enabled').notNull().default(0),
  syncToken: text('sync_token'),
  lastSyncAt: text('last_sync_at'),
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type GoogleCalendar = typeof googleCalendars.$inferSelect
export type NewGoogleCalendar = typeof googleCalendars.$inferInsert
export type AppSetting = typeof appSettings.$inferSelect
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate
```
Expected: a new `lib/db/migrations/0001_*.sql` file.

- [ ] **Step 3: Edit migration to backfill `source`**

Open the generated `.sql` file. After the `ALTER TABLE events ADD COLUMN source` statement, add:

```sql
UPDATE events SET source = 'holiday' WHERE type = 'holiday';
CREATE UNIQUE INDEX IF NOT EXISTS events_google_unique ON events (google_calendar_id, google_event_id) WHERE google_event_id IS NOT NULL;
```

- [ ] **Step 4: Apply migration**

```bash
npm run db:migrate
```
Expected: migration applied, no errors.

- [ ] **Step 5: Verify**

```bash
sqlite3 local.db ".schema events" | grep source
sqlite3 local.db "SELECT DISTINCT source FROM events;"
```
Expected: `source` column present; rows return `local` and/or `holiday`.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add lib/db/schema.ts lib/db/migrations/
git commit -m "db: add integrations, google_calendars, app_settings tables + events.source"
```

---

## Task 3: Typed `app_settings` helpers

**Files:**
- Create: `lib/settings.ts`
- Create: `lib/settings.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { appSettings } from './db/schema'
import { getSetting, setSetting, getAllSettings } from './settings'

describe('settings', () => {
  beforeEach(async () => {
    await db.delete(appSettings)
  })

  it('returns default when key absent', async () => {
    const v = await getSetting('theme', 'system')
    expect(v).toBe('system')
  })

  it('round-trips a value', async () => {
    await setSetting('theme', 'dark')
    expect(await getSetting('theme', 'system')).toBe('dark')
  })

  it('returns all settings as a map', async () => {
    await setSetting('theme', 'dark')
    await setSetting('default_view', 'week')
    const all = await getAllSettings()
    expect(all).toEqual({ theme: 'dark', default_view: 'week' })
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- settings.test
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/settings.ts
import { eq } from 'drizzle-orm'
import { db } from './db'
import { appSettings } from './db/schema'

export async function getSetting(key: string, fallback: string): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key))
  return row?.value ?? fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings)
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- settings.test
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts lib/settings.test.ts
git commit -m "feat: add typed app_settings helpers"
```

---

## Task 4: `/api/settings` route

**Files:**
- Create: `app/api/settings/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAllSettings, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = new Set(['theme', 'default_view', 'daily_summary_time'])

export async function GET() {
  try {
    const data = await getAllSettings()
    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
    }
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) {
        return NextResponse.json({ error: `Unknown setting: ${k}` }, { status: 400 })
      }
      if (typeof v !== 'string') {
        return NextResponse.json({ error: `${k} must be a string` }, { status: 400 })
      }
      await setSetting(k, v)
    }
    return NextResponse.json({ data: await getAllSettings() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
# In another terminal:
curl -s localhost:3000/api/settings
curl -s -X PATCH localhost:3000/api/settings -H 'content-type: application/json' -d '{"theme":"dark"}'
curl -s localhost:3000/api/settings
```
Expected: first empty object, then `{"data":{"theme":"dark"}}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/route.ts
git commit -m "feat: add /api/settings GET + PATCH"
```

---

## Task 5: Google OAuth client wrapper

**Files:**
- Create: `lib/google/client.ts`

- [ ] **Step 1: Implement**

```ts
// lib/google/client.ts
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { integrations, type Integration } from '@/lib/db/schema'

const REDIRECT_URI = 'http://localhost:3000/api/integrations/google/callback'
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
]

export function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set')
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export function buildConsentUrl(state: string): string {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })
}

export async function getIntegration(): Promise<Integration | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, 'google'))
  return row ?? null
}

/**
 * Returns an authenticated OAuth2 client with a fresh access token.
 * Refreshes the token (and persists) if expired or within 60s of expiry.
 */
export async function getAuthedClient(): Promise<OAuth2Client> {
  const row = await getIntegration()
  if (!row) throw new Error('NOT_CONNECTED')

  const client = createOAuthClient()
  client.setCredentials({
    refresh_token: row.refreshToken,
    access_token: row.accessToken ?? undefined,
    expiry_date: row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : undefined,
  })

  const expiresAt = row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : 0
  if (!row.accessToken || Date.now() >= expiresAt - 60_000) {
    const { credentials } = await client.refreshAccessToken()
    await db
      .update(integrations)
      .set({
        accessToken: credentials.access_token ?? null,
        accessExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        refreshToken: credentials.refresh_token ?? row.refreshToken,
      })
      .where(eq(integrations.provider, 'google'))
    client.setCredentials(credentials)
  }

  return client
}

export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    const client = createOAuthClient()
    await client.revokeToken(refreshToken)
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/google/client.ts
git commit -m "feat: add Google OAuth client wrapper"
```

---

## Task 6: Google event → NewEvent mapper

**Files:**
- Create: `lib/google/mapper.ts`
- Create: `lib/google/mapper.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/google/mapper.test.ts
import { describe, it, expect } from 'vitest'
import { mapRecurrence, mapGoogleEvent } from './mapper'

describe('mapRecurrence', () => {
  it('maps simple FREQ=DAILY', () => {
    expect(mapRecurrence(['RRULE:FREQ=DAILY'])).toBe('daily')
  })
  it('maps simple FREQ=WEEKLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=WEEKLY'])).toBe('weekly')
  })
  it('maps simple FREQ=MONTHLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=MONTHLY'])).toBe('monthly')
  })
  it('maps simple FREQ=YEARLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=YEARLY'])).toBe('yearly')
  })
  it('falls back to none for BYDAY', () => {
    expect(mapRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])).toBe('none')
  })
  it('falls back to none for COUNT', () => {
    expect(mapRecurrence(['RRULE:FREQ=DAILY;COUNT=5'])).toBe('none')
  })
  it('returns none for no rules', () => {
    expect(mapRecurrence(undefined)).toBe('none')
    expect(mapRecurrence([])).toBe('none')
  })
})

describe('mapGoogleEvent', () => {
  const calendar = { id: 'cal@x', summary: 'Work', backgroundColor: '#ff0000', enabled: 1, syncToken: null, lastSyncAt: null }

  it('maps a timed event', () => {
    const g = {
      id: 'ev1',
      summary: 'Meeting',
      description: 'about X',
      location: 'Room 1',
      start: { dateTime: '2026-05-01T10:00:00Z' },
      end: { dateTime: '2026-05-01T11:00:00Z' },
      status: 'confirmed',
    }
    const out = mapGoogleEvent(g, calendar)
    expect(out).toMatchObject({
      title: 'Meeting',
      description: 'about X',
      location: 'Room 1',
      start: '2026-05-01T10:00:00.000Z',
      end: '2026-05-01T11:00:00.000Z',
      allDay: 0,
      type: 'event',
      source: 'google',
      color: '#ff0000',
      googleEventId: 'ev1',
      googleCalendarId: 'cal@x',
      recurrence: 'none',
    })
  })

  it('maps an all-day event', () => {
    const g = {
      id: 'ev2',
      summary: 'Holiday',
      start: { date: '2026-05-01' },
      end: { date: '2026-05-02' },
      status: 'confirmed',
    }
    const out = mapGoogleEvent(g, calendar)
    expect(out.allDay).toBe(1)
    expect(out.start).toBe('2026-05-01T00:00:00.000Z')
    expect(out.end).toBe('2026-05-01T23:59:59.000Z')
  })

  it('uses fallback title for empty summary', () => {
    const g = { id: 'ev3', start: { dateTime: '2026-05-01T10:00:00Z' }, end: { dateTime: '2026-05-01T11:00:00Z' }, status: 'confirmed' }
    expect(mapGoogleEvent(g, calendar).title).toBe('(no title)')
  })

  it('falls back to type color if calendar has no background', () => {
    const cal = { ...calendar, backgroundColor: null }
    const g = { id: 'e', summary: 'x', start: { dateTime: '2026-05-01T10:00:00Z' }, end: { dateTime: '2026-05-01T11:00:00Z' }, status: 'confirmed' }
    expect(mapGoogleEvent(g, cal).color).toBe('#00aaff')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- mapper.test
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/google/mapper.ts
import type { calendar_v3 } from 'googleapis'
import type { NewEvent, GoogleCalendar } from '@/lib/db/schema'
import { TYPE_COLORS } from '@/lib/db/schema'

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
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- mapper.test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/google/mapper.ts lib/google/mapper.test.ts
git commit -m "feat: add Google event → NewEvent mapper"
```

---

## Task 7: Sync algorithm

**Files:**
- Create: `lib/google/sync.ts`
- Create: `lib/google/sync.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/google/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { events, googleCalendars, integrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// Mock the client module BEFORE importing sync
vi.mock('./client', () => ({
  getAuthedClient: vi.fn(),
  getIntegration: vi.fn(),
}))

// Mock googleapis
const listMock = vi.fn()
vi.mock('googleapis', () => ({
  google: {
    calendar: () => ({ events: { list: listMock } }),
  },
}))

import { syncGoogleCalendars } from './sync'
import { getAuthedClient, getIntegration } from './client'

describe('syncGoogleCalendars', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(events)
    await db.delete(googleCalendars)
    await db.delete(integrations)
    await db.insert(integrations).values({
      provider: 'google',
      accountEmail: 't@x',
      refreshToken: 'r',
      scopes: 'x',
    })
    await db.insert(googleCalendars).values({
      id: 'cal1',
      summary: 'Work',
      backgroundColor: '#ff0000',
      enabled: 1,
    })
    ;(getAuthedClient as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'google', accountEmail: 't@x', refreshToken: 'r',
    })
  })

  it('upserts events and persists syncToken', async () => {
    listMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'e1', summary: 'M', status: 'confirmed',
            start: { dateTime: '2026-05-01T10:00:00Z' },
            end: { dateTime: '2026-05-01T11:00:00Z' },
          },
        ],
        nextSyncToken: 'tok1',
      },
    })

    await syncGoogleCalendars()

    const [row] = await db.select().from(events)
    expect(row.title).toBe('M')
    expect(row.source).toBe('google')
    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, 'cal1'))
    expect(cal.syncToken).toBe('tok1')
  })

  it('deletes events with status=cancelled', async () => {
    await db.insert(events).values({
      title: 'M', start: '2026-05-01T10:00:00.000Z', end: '2026-05-01T11:00:00.000Z',
      color: '#ff0000', type: 'event', source: 'google',
      googleCalendarId: 'cal1', googleEventId: 'e1',
    })

    listMock.mockResolvedValueOnce({
      data: { items: [{ id: 'e1', status: 'cancelled' }], nextSyncToken: 'tok2' },
    })

    await syncGoogleCalendars()

    const rows = await db.select().from(events)
    expect(rows).toHaveLength(0)
  })

  it('recovers from 410 by clearing syncToken', async () => {
    await db.update(googleCalendars).set({ syncToken: 'stale' }).where(eq(googleCalendars.id, 'cal1'))

    const gone = Object.assign(new Error('Gone'), { code: 410 })
    listMock.mockRejectedValueOnce(gone).mockResolvedValueOnce({
      data: { items: [], nextSyncToken: 'fresh' },
    })

    await syncGoogleCalendars()

    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, 'cal1'))
    expect(cal.syncToken).toBe('fresh')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- sync.test
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/google/sync.ts
import { google, type calendar_v3 } from 'googleapis'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { events, googleCalendars, integrations, type GoogleCalendar } from '@/lib/db/schema'
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

    const targets: GoogleCalendar[] = calendarIds
      ? await db.select().from(googleCalendars).where(
          and(...calendarIds.map(id => eq(googleCalendars.id, id)))
        )
      : await db.select().from(googleCalendars).where(eq(googleCalendars.enabled, 1))

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
        await db
          .insert(events)
          .values(row)
          .onConflictDoUpdate({
            target: [events.googleCalendarId, events.googleEventId],
            set: {
              title: row.title,
              start: row.start,
              end: row.end,
              allDay: row.allDay,
              description: row.description,
              location: row.location,
              recurrence: row.recurrence,
              color: row.color,
              updatedAt: new Date().toISOString(),
            },
          })
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
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- sync.test
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/google/sync.ts lib/google/sync.test.ts
git commit -m "feat: add Google Calendar sync algorithm"
```

---

## Task 8: OAuth authorize route

**Files:**
- Create: `app/api/integrations/google/authorize/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/integrations/google/authorize/route.ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { buildConsentUrl } from '@/lib/google/client'

export async function GET() {
  try {
    const state = randomBytes(16).toString('hex')
    const url = buildConsentUrl(state)
    const res = NextResponse.redirect(url)
    res.cookies.set('google_oauth_state', state, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600,
    })
    return res
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/integrations/google/authorize/route.ts
git commit -m "feat: add Google OAuth authorize route"
```

---

## Task 9: OAuth callback route + initial calendar list discovery

**Files:**
- Create: `app/api/integrations/google/callback/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/integrations/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { db } from '@/lib/db'
import { integrations, googleCalendars } from '@/lib/db/schema'
import { createOAuthClient, GOOGLE_SCOPES } from '@/lib/google/client'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const cookieState = req.cookies.get('google_oauth_state')?.value

    if (!code || !state || state !== cookieState) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
    }

    const client = createOAuthClient()
    const { tokens } = await client.getToken(code)
    if (!tokens.refresh_token) {
      return NextResponse.json({ error: 'No refresh token received — revoke app access at myaccount.google.com and retry' }, { status: 400 })
    }
    client.setCredentials(tokens)

    // Fetch email from id_token
    const idToken = tokens.id_token
    let email = 'unknown'
    if (idToken) {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf-8'))
      email = payload.email ?? 'unknown'
    }

    // Upsert integration
    await db
      .insert(integrations)
      .values({
        provider: 'google',
        accountEmail: email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes: GOOGLE_SCOPES.join(' '),
      })
      .onConflictDoUpdate({
        target: integrations.provider,
        set: {
          accountEmail: email,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token ?? null,
          accessExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          scopes: GOOGLE_SCOPES.join(' '),
          connectedAt: new Date().toISOString(),
          lastSyncAt: null,
          lastSyncError: null,
        },
      })

    // Fetch calendar list
    const cal = google.calendar({ version: 'v3', auth: client })
    const list = await cal.calendarList.list()
    for (const item of list.data.items ?? []) {
      if (!item.id) continue
      await db
        .insert(googleCalendars)
        .values({
          id: item.id,
          summary: item.summary ?? item.id,
          backgroundColor: item.backgroundColor ?? null,
          enabled: 0,
        })
        .onConflictDoUpdate({
          target: googleCalendars.id,
          set: {
            summary: item.summary ?? item.id,
            backgroundColor: item.backgroundColor ?? null,
          },
        })
    }

    const res = NextResponse.redirect(new URL('/settings', req.url))
    res.cookies.delete('google_oauth_state')
    return res
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/integrations/google/callback/route.ts
git commit -m "feat: add Google OAuth callback route"
```

---

## Task 10: Status + disconnect route

**Files:**
- Create: `app/api/integrations/google/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/integrations/google/route.ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { integrations, googleCalendars, events } from '@/lib/db/schema'
import { getIntegration, revokeToken } from '@/lib/google/client'

export async function GET() {
  try {
    const row = await getIntegration()
    if (!row) {
      return NextResponse.json({ data: { connected: false, calendars: [] } })
    }
    const calendars = await db.select().from(googleCalendars)
    return NextResponse.json({
      data: {
        connected: true,
        accountEmail: row.accountEmail,
        lastSyncAt: row.lastSyncAt,
        lastSyncError: row.lastSyncError,
        calendars,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const row = await getIntegration()
    if (!row) return NextResponse.json({ data: { ok: true } })
    await revokeToken(row.refreshToken)
    await db.delete(events).where(eq(events.source, 'google'))
    await db.delete(googleCalendars)
    await db.delete(integrations).where(eq(integrations.provider, 'google'))
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/integrations/google/route.ts
git commit -m "feat: add Google integration status + disconnect route"
```

---

## Task 11: Manual sync route + per-calendar toggle route

**Files:**
- Create: `app/api/integrations/google/sync/route.ts`
- Create: `app/api/integrations/google/calendars/[id]/route.ts`

- [ ] **Step 1: Implement sync route**

```ts
// app/api/integrations/google/sync/route.ts
import { NextResponse } from 'next/server'
import { syncGoogleCalendars, NotConnectedError, AlreadySyncingError } from '@/lib/google/sync'
import { getIntegration } from '@/lib/google/client'

export async function POST() {
  try {
    const { errors } = await syncGoogleCalendars()
    const row = await getIntegration()
    return NextResponse.json({
      data: { lastSyncAt: row?.lastSyncAt, errors },
    })
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
    }
    if (e instanceof AlreadySyncingError) {
      return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
```

- [ ] **Step 2: Implement per-calendar toggle**

```ts
// app/api/integrations/google/calendars/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { googleCalendars, events } from '@/lib/db/schema'
import { syncGoogleCalendars } from '@/lib/google/sync'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
    }

    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, id))
    if (!cal) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

    if (body.enabled && !cal.enabled) {
      await db.update(googleCalendars).set({ enabled: 1 }).where(eq(googleCalendars.id, id))
      await syncGoogleCalendars([id])
    } else if (!body.enabled && cal.enabled) {
      await db.delete(events).where(and(eq(events.source, 'google'), eq(events.googleCalendarId, id)))
      await db.update(googleCalendars).set({ enabled: 0, syncToken: null }).where(eq(googleCalendars.id, id))
    }

    const [updated] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, id))
    return NextResponse.json({ data: updated })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/integrations/google/sync/route.ts app/api/integrations/google/calendars/
git commit -m "feat: add manual sync + per-calendar toggle routes"
```

---

## Task 12: Harden event PATCH/DELETE — 403 on non-local sources

**Files:**
- Modify: `app/api/events/[id]/route.ts`

- [ ] **Step 1: Replace the two `type === 'holiday'` guards**

In `PATCH`, replace:

```ts
if (existing.type === 'holiday') {
  return NextResponse.json({ error: 'Holidays are system-managed' }, { status: 403 })
}
```

with:

```ts
if (existing.source !== 'local') {
  return NextResponse.json({ error: 'Events from external sources are read-only' }, { status: 403 })
}
```

Apply the same replacement in `DELETE`.

- [ ] **Step 2: Manual smoke**

```bash
# Pick any holiday id and any regular event id first (from the UI or sqlite)
# sqlite3 local.db "SELECT id,title,type,source FROM events WHERE type='holiday' LIMIT 1;"
curl -s -X DELETE localhost:3000/api/events/<holiday_id>
# Expected: 403 with "Events from external sources are read-only"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/events/[id]/route.ts
git commit -m "fix(api): 403 on edit/delete of external-source events"
```

---

## Task 13: Settings page scaffold + IntegrationsCard

**Files:**
- Create: `app/settings/page.tsx`
- Create: `components/settings/IntegrationsCard.tsx`

- [ ] **Step 1: Settings page shell**

```tsx
// app/settings/page.tsx
import IntegrationsCard from '@/components/settings/IntegrationsCard'
import SummaryCard from '@/components/settings/SummaryCard'
import AppearanceCard from '@/components/settings/AppearanceCard'

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <IntegrationsCard />
      <SummaryCard />
      <AppearanceCard />
    </main>
  )
}
```

- [ ] **Step 2: IntegrationsCard component**

```tsx
// components/settings/IntegrationsCard.tsx
'use client'
import useSWR from 'swr'
import { useState } from 'react'

type Calendar = { id: string, summary: string, backgroundColor: string | null, enabled: number }
type Status = {
  connected: boolean
  accountEmail?: string
  lastSyncAt?: string | null
  lastSyncError?: string | null
  calendars: Calendar[]
}

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Status)

export default function IntegrationsCard() {
  const { data, mutate } = useSWR<Status>('/api/integrations/google', fetcher)
  const [syncing, setSyncing] = useState(false)

  async function syncNow() {
    setSyncing(true)
    try {
      await fetch('/api/integrations/google/sync', { method: 'POST' })
      await mutate()
    } finally {
      setSyncing(false)
    }
  }

  async function toggleCalendar(id: string, enabled: boolean) {
    await fetch(`/api/integrations/google/calendars/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    await mutate()
  }

  async function disconnect() {
    if (!confirm('Disconnect and remove all synced Google events?')) return
    await fetch('/api/integrations/google', { method: 'DELETE' })
    await mutate()
  }

  if (!data) return <section className="p-4 border rounded">Loading…</section>

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Integrations</h2>
      <div>
        <h3 className="font-medium">Google Calendar</h3>
        {!data.connected ? (
          <div className="mt-2 space-y-1">
            <a href="/api/integrations/google/authorize" className="inline-block px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Connect Google Calendar</a>
            <p className="text-xs text-neutral-500">Open this page from the calendar host machine to complete sign-in.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <div>Connected as <strong>{data.accountEmail}</strong></div>
            <div className="text-neutral-500">
              {data.lastSyncAt ? `Last synced ${new Date(data.lastSyncAt).toLocaleString()}` : 'Not synced yet'}
            </div>
            {data.lastSyncError && (
              <div className="p-2 rounded bg-red-100 text-red-800">{data.lastSyncError}</div>
            )}
            <button onClick={syncNow} disabled={syncing} className="px-3 py-1 rounded border text-sm">
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <ul className="divide-y border rounded">
              {data.calendars.map(c => (
                <li key={c.id} className="flex items-center gap-2 p-2">
                  <input
                    type="checkbox"
                    checked={c.enabled === 1}
                    onChange={e => toggleCalendar(c.id, e.target.checked)}
                  />
                  <span className="inline-block w-3 h-3 rounded" style={{ background: c.backgroundColor ?? '#999' }} />
                  <span>{c.summary}</span>
                </li>
              ))}
            </ul>
            <button onClick={disconnect} className="text-sm text-red-600 underline">Disconnect</button>
          </div>
        )}
      </div>
      <TelegramStatus />
    </section>
  )
}

function TelegramStatus() {
  return (
    <div className="pt-3 border-t">
      <h3 className="font-medium">Telegram</h3>
      <p className="text-xs text-neutral-500 mt-1">
        Configured via environment variables. Edit <code>.env.local</code> and restart the server to change.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
# Visit http://localhost:3000/settings
```
Expected: page renders; "Connect Google Calendar" button visible.

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx components/settings/IntegrationsCard.tsx
git commit -m "feat(settings): add settings page + integrations card"
```

---

## Task 14: SummaryCard (daily summary time + regenerate)

**Files:**
- Create: `components/settings/SummaryCard.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/settings/SummaryCard.tsx
'use client'
import useSWR from 'swr'
import { useState } from 'react'

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Record<string, string>)

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default function SummaryCard() {
  const { data, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)
  const [saving, setSaving] = useState(false)
  const [regen, setRegen] = useState(false)

  const time = data?.daily_summary_time ?? '08:00'

  async function saveTime(value: string) {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ daily_summary_time: value }),
      })
      await mutate()
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setRegen(true)
    try {
      await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: todayMadrid() }),
      })
    } finally {
      setRegen(false)
    }
  }

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Daily summary</h2>
      <label className="flex items-center gap-2 text-sm">
        Time of day (Europe/Madrid):
        <input
          type="time"
          value={time}
          onChange={e => saveTime(e.target.value)}
          disabled={saving}
          className="border rounded px-2 py-1"
        />
      </label>
      <button onClick={regenerate} disabled={regen} className="px-3 py-1 rounded border text-sm">
        {regen ? 'Regenerating…' : "Regenerate today's summary"}
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/SummaryCard.tsx
git commit -m "feat(settings): add daily summary card"
```

---

## Task 15: AppearanceCard (theme + default view)

**Files:**
- Create: `components/settings/AppearanceCard.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/settings/AppearanceCard.tsx
'use client'
import useSWR from 'swr'

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Record<string, string>)

export default function AppearanceCard() {
  const { data, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)

  async function save(key: string, value: string) {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    await mutate()
  }

  const theme = data?.theme ?? 'system'
  const view = data?.default_view ?? 'month'

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Appearance & defaults</h2>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Theme</legend>
        {(['light', 'dark', 'system'] as const).map(v => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="theme" checked={theme === v} onChange={() => save('theme', v)} />
            {v}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Default view</legend>
        {(['month', 'week', 'day', 'agenda'] as const).map(v => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="default_view" checked={view === v} onChange={() => save('default_view', v)} />
            {v}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/AppearanceCard.tsx
git commit -m "feat(settings): add appearance card"
```

---

## Task 16: Sidebar — Google calendars section

**Files:**
- Modify: `components/calendar/Sidebar.tsx`
- Modify: `components/calendar/CalendarShell.tsx` (pass visible-google-calendar state through)

- [ ] **Step 1: Read the Sidebar component**

```bash
# Review current structure
```

Open `components/calendar/Sidebar.tsx` and note its props + where filters are rendered.

- [ ] **Step 2: Add Google calendars subsection**

In `Sidebar.tsx`, add a new `useSWR` call for `/api/integrations/google`, filter to `calendars` where `enabled === 1`, and render:

```tsx
{enabledGoogleCalendars.length > 0 && (
  <section className="mt-4">
    <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Google Calendars</h3>
    <ul className="space-y-1">
      {enabledGoogleCalendars.map(c => (
        <li key={c.id}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visibleGoogleCalendars.has(c.id)}
              onChange={e => onToggleGoogleCalendar(c.id, e.target.checked)}
            />
            <span className="inline-block w-3 h-3 rounded" style={{ background: c.backgroundColor ?? '#999' }} />
            {c.summary}
          </label>
        </li>
      ))}
    </ul>
  </section>
)}
```

Add the props `visibleGoogleCalendars: Set<string>` and `onToggleGoogleCalendar: (id: string, v: boolean) => void` to `Sidebar`'s prop type.

- [ ] **Step 3: Wire state in CalendarShell**

In `CalendarShell.tsx`:

```tsx
const [visibleGoogleCalendars, setVisibleGoogleCalendars] = useState<Set<string>>(() => {
  if (typeof window === 'undefined') return new Set()
  const raw = localStorage.getItem('visibleGoogleCalendars')
  return raw ? new Set(JSON.parse(raw)) : new Set()
})

useEffect(() => {
  localStorage.setItem('visibleGoogleCalendars', JSON.stringify([...visibleGoogleCalendars]))
}, [visibleGoogleCalendars])

function toggleGoogleCalendar(id: string, enabled: boolean) {
  setVisibleGoogleCalendars(prev => {
    const next = new Set(prev)
    if (enabled) next.add(id); else next.delete(id)
    return next
  })
}
```

Pass to Sidebar; pass to view components so they can filter `events` by `!event.googleCalendarId || visibleGoogleCalendars.has(event.googleCalendarId)`.

Also in each view component (MonthView/WeekView/DayView/AgendaView), add a filter step before rendering:

```tsx
const filtered = events.filter(e => !e.googleCalendarId || visibleGoogleCalendars.has(e.googleCalendarId))
```

(This adds one line per view. If there are shared helpers, add it there instead.)

- [ ] **Step 4: Default-on when a calendar is first enabled**

When a new Google calendar is detected in the status response that isn't in `visibleGoogleCalendars`, add it:

```tsx
useEffect(() => {
  if (!googleStatus?.calendars) return
  const enabled = googleStatus.calendars.filter(c => c.enabled === 1).map(c => c.id)
  setVisibleGoogleCalendars(prev => {
    const next = new Set(prev)
    for (const id of enabled) next.add(id)
    return next
  })
}, [googleStatus])
```

- [ ] **Step 5: Typecheck + manual smoke**

```bash
npm run typecheck
npm run dev
# Visit http://localhost:3000, open sidebar — no Google section yet (nothing enabled).
```

- [ ] **Step 6: Commit**

```bash
git add components/calendar/Sidebar.tsx components/calendar/CalendarShell.tsx components/calendar/MonthView.tsx components/calendar/WeekView.tsx components/calendar/DayView.tsx components/calendar/AgendaView.tsx
git commit -m "feat(sidebar): Google calendars visibility section"
```

---

## Task 17: CalendarShell reads theme + default view from settings

**Files:**
- Modify: `components/calendar/CalendarShell.tsx`

- [ ] **Step 1: Add SWR fetch for settings**

```tsx
const { data: settings } = useSWR<Record<string, string>>('/api/settings', (u: string) => fetch(u).then(r => r.json()).then(j => j.data))
```

- [ ] **Step 2: Apply theme**

```tsx
useEffect(() => {
  const theme = settings?.theme ?? 'system'
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else if (theme === 'light') root.classList.remove('dark')
  else {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    root.classList.toggle('dark', mq.matches)
    const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }
}, [settings?.theme])
```

- [ ] **Step 3: Apply default view on first mount**

Only set the view from `settings.default_view` once, on the initial render after settings arrive, to avoid clobbering user navigation:

```tsx
const appliedDefault = useRef(false)
useEffect(() => {
  if (!settings?.default_view || appliedDefault.current) return
  appliedDefault.current = true
  setView(settings.default_view as 'month' | 'week' | 'day' | 'agenda')
}, [settings?.default_view])
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add components/calendar/CalendarShell.tsx
git commit -m "feat(calendar): honor theme + default_view from settings"
```

---

## Task 18: Cron — daily Google sync + reschedulable summary

**Files:**
- Modify: `lib/cron.ts`

- [ ] **Step 1: Add Google sync job**

Near the top of `lib/cron.ts`, import:

```ts
import { syncGoogleCalendars } from './google/sync'
```

Inside `startCronJobs()`, after the existing reminders cron, add:

```ts
const googleCron = process.env.GOOGLE_SYNC_CRON ?? '0 3 * * *'
cron.schedule(googleCron, async () => {
  console.log('[Cron] Google sync started')
  try {
    const { errors } = await syncGoogleCalendars()
    if (errors.length > 0) {
      console.error('[Cron] Google sync completed with errors:', errors)
    } else {
      console.log('[Cron] Google sync OK')
    }
  } catch (e) {
    console.error('[Cron] Google sync failed:', e)
  }
}, { timezone: 'Europe/Madrid' })
console.log(`[Cron] Google sync scheduled: ${googleCron}`)
```

- [ ] **Step 2: Extract the existing summary handler into a named function**

In `lib/cron.ts`, take the entire async callback currently passed to `cron.schedule(cronExpression, async () => { ... })` (the body starting with `console.log('[Cron] Daily summary job started')` and ending with the outer try/catch) and move it into a module-level function:

```ts
async function runDailySummary(): Promise<void> {
  console.log('[Cron] Daily summary job started')
  // ...the entire existing body of the old inline callback, unchanged...
}
```

- [ ] **Step 3: Make summary cron reschedulable from settings**

Replace the old `cron.schedule(cronExpression, async () => { ... })` call with a rescheduler that reads `app_settings`:

```ts
import { getSetting } from './settings'

let summaryTask: ReturnType<typeof cron.schedule> | null = null

export async function scheduleSummary(): Promise<void> {
  const time = await getSetting('daily_summary_time', '') // HH:MM or ''
  let expr: string
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number)
    expr = `${m} ${h} * * *`
  } else {
    expr = process.env.DAILY_SUMMARY_CRON || '0 8 * * *'
  }

  if (summaryTask) summaryTask.stop()
  summaryTask = cron.schedule(expr, runDailySummary, { timezone: 'Europe/Madrid' })
  console.log(`[Cron] Daily summary (re)scheduled: ${expr}`)
}
```

Change `startCronJobs` to call `await scheduleSummary()` instead of the old inline `cron.schedule` block. Keep the existing reminder cron and the new Google-sync cron alongside it.

- [ ] **Step 3: Reschedule when setting changes**

In `app/api/settings/route.ts`, in the PATCH handler, after `await setSetting(k, v)`:

```ts
if (k === 'daily_summary_time') {
  const { scheduleSummary } = await import('@/lib/cron')
  await scheduleSummary()
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add lib/cron.ts app/api/settings/route.ts
git commit -m "feat(cron): daily Google sync + reschedulable summary"
```

---

## Task 19: Env example + README setup section

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: Add env vars**

Append to `.env.local.example`:

```bash
# Google Calendar sync (one-way, read-only)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# node-cron expression, Madrid time. Defaults to 3 AM daily.
GOOGLE_SYNC_CRON=0 3 * * *
```

- [ ] **Step 2: README section**

Append to `README.md` (new section):

```markdown
## Google Calendar integration

One-way (read-only) sync from a Google account. Events mirror into the local DB with `source='google'`; they render alongside local events but cannot be edited from this app.

### One-time setup

1. Go to <https://console.cloud.google.com/>, create (or pick) a project.
2. **APIs & Services → Library** → enable the **Google Calendar API**.
3. **OAuth consent screen** → External → add yourself as a test user. Scopes: `calendar.readonly`, `openid`, `email`.
4. **Credentials → Create Credentials → OAuth client ID** → Web application.
   - Authorized redirect URI: `http://localhost:3000/api/integrations/google/callback`
5. Put the client ID + secret into `.env.local`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
6. Start the app, **open `http://localhost:3000/settings` in a browser running on the same machine as the app** (or SSH port-forward), click **Connect Google Calendar**, complete consent.
7. Pick which calendars to sync. Initial sync runs immediately per calendar.

### Why localhost

Google OAuth rejects non-HTTPS redirect URIs except `localhost`/`127.0.0.1`. The consent dance must happen through localhost; after that, refresh-token-based sync works headlessly from anywhere on the LAN.

### Sync cadence

- Daily at 03:00 Madrid time (override with `GOOGLE_SYNC_CRON`).
- Manual **Sync now** button on `/settings`.
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: Google Calendar setup instructions + env vars"
```

---

## Task 20: End-to-end verification

- [ ] **Step 1: Typecheck + tests**

```bash
npm run typecheck
npm test
```
Expected: zero type errors, all tests pass.

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Manual flow**

Assuming OAuth client is configured:

1. Start `npm run dev`.
2. Visit `http://localhost:3000/settings`.
3. Click **Connect Google Calendar** → complete consent → lands back on `/settings`.
4. Calendar list populated; enable one calendar → initial sync runs → status shows "synced Xs ago".
5. Navigate to `/` → events from that calendar visible in month view, colored by calendar.
6. Try `DELETE /api/events/<google-event-id>` via curl → 403.
7. Uncheck the calendar in the sidebar → events disappear from the view but stay in DB.
8. Toggle the calendar off in Settings → events purged from DB.
9. **Disconnect** → all Google data gone; local events untouched.

- [ ] **Step 4: Record manual-test results in a comment on the plan**

Update the bottom of this file with a "Verified: YYYY-MM-DD" line once all manual steps pass.

- [ ] **Step 5: Final commit if any fixups**

```bash
git status
# commit only if there are changes
```
