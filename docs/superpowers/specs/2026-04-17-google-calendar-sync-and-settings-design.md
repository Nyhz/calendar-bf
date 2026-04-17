# Google Calendar sync + Settings page

**Status:** Design approved, pending user spec review
**Date:** 2026-04-17

## Goal

Add one-way (read-only) Google Calendar sync to the personal calendar app, and introduce a `/settings` page that centralises configuration currently scattered across `localStorage`, env vars, and non-existent UI.

Primary user story: the user connects one Google account, picks which of its calendars to sync, and those events show up alongside local events in every view. They can toggle visibility per calendar from the sidebar and disconnect cleanly from settings. The app never writes to Google.

## Non-goals

- Two-way sync (never).
- Multiple Google accounts (design allows it later; v1 is single-account).
- Per-event editing of synced Google events (they are read-only mirrors; PATCH/DELETE return 403).
- Importing attendees, organiser info, attachments, meeting links, or colour-per-event (colours come from the calendar, not the event).
- Real-time push notifications from Google. Cadence is daily cron + manual "Sync now".
- Encrypted-at-rest token storage. Trust boundary is the local SQLite file, same as `.env.local`.

## Constraints

- LAN-only deployment (`calendar.lan`). Google OAuth rejects non-HTTPS redirects except `http://localhost` / `127.0.0.1`, so the OAuth consent flow must be completed from a browser on the host machine (or via SSH port-forward). Refresh-token use does not need a browser, so scheduled syncs work from anywhere on the LAN after the one-time connect.
- Single-user app. Same trust model as existing routes — no auth on web endpoints beyond the existing Telegram user-ID check on the bot side.
- `Europe/Madrid` timezone is the single source of truth for display; all datetimes stored as UTC ISO 8601.
- Sync cadence: once every 24h via `node-cron`, plus a manual button. Rationale: ~90% of user's work events are recurring and rarely change.

## Architecture overview

```
┌─────────────┐    OAuth consent     ┌──────────────┐
│  /settings  │ ───────────────────► │  Google OAuth│
│   page      │ ◄─────── code ────── │              │
└──────┬──────┘                      └──────┬───────┘
       │                                    │
       ▼                                    │ access/refresh tokens
┌─────────────────┐                         │
│ integrations    │ ◄───────────────────────┘
│ google_calendars│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐      calendar.events.list
│ lib/google/     │ ───────────────────────────► Google Calendar API
│   sync.ts       │ ◄─────────────────────────── events + nextSyncToken
└──────┬──────────┘
       │ upsert by (calendar_id, google_event_id)
       ▼
┌─────────────────┐
│ events table    │ (source='google' rows alongside source='local'|'holiday')
└─────────────────┘
```

Sync is invoked from three places: (1) the daily `node-cron` job, (2) `POST /api/integrations/google/sync` (manual button), (3) the `PATCH /api/integrations/google/calendars/:id` handler when `enabled` flips from 0 to 1 (immediate initial load for that calendar).

## Data model

### New table: `integrations`

Single-row-per-provider. Supports future providers (Outlook, etc.) without schema churn.

```ts
export const integrations = sqliteTable('integrations', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  provider:        text('provider').notNull().unique(),   // 'google'
  accountEmail:    text('account_email').notNull(),
  refreshToken:    text('refresh_token').notNull(),
  accessToken:     text('access_token'),
  accessExpiresAt: text('access_expires_at'),             // ISO UTC
  scopes:          text('scopes').notNull(),              // space-separated
  connectedAt:     text('connected_at').notNull().default(sql`(datetime('now'))`),
  lastSyncAt:      text('last_sync_at'),
  lastSyncError:   text('last_sync_error'),               // null on success; preserves last-success lastSyncAt separately
})
```

### New table: `google_calendars`

One row per calendar visible to the connected Google account. `enabled` is the user's "sync this at all" toggle (settings page). Sidebar visibility is a separate client-side filter.

```ts
export const googleCalendars = sqliteTable('google_calendars', {
  id:              text('id').primaryKey(),              // Google calendar id
  summary:         text('summary').notNull(),
  backgroundColor: text('background_color'),             // from Google, used for event colouring
  enabled:         integer('enabled').notNull().default(0),
  syncToken:       text('sync_token'),                   // Google incremental cursor
  lastSyncAt:      text('last_sync_at'),
})
```

### New table: `app_settings`

Key/value store for user-facing settings that previously lived in `localStorage` or env vars. Server-side so settings follow the user across LAN devices.

```ts
export const appSettings = sqliteTable('app_settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),  // JSON-encoded for non-string values
})
```

Seeded keys: `daily_summary_time` (HH:MM, defaults from `DAILY_SUMMARY_CRON`), `default_view` (`'month'`), `theme` (`'system'`).

### Extensions to `events`

Three new columns, added by migration with defaults so existing rows stay valid:

```ts
source:           text('source').notNull().default('local'),  // 'local' | 'google' | 'holiday'
googleEventId:    text('google_event_id'),
googleCalendarId: text('google_calendar_id'),
```

Migration also backfills `source='holiday'` where `type='holiday'`. A unique index on `(google_calendar_id, google_event_id)` enables clean upserts. `google_calendar_id` is a FK to `google_calendars.id` with `ON DELETE CASCADE` — disconnecting or disabling a calendar purges its events automatically.

### API contract change

`PATCH /api/events/:id` and `DELETE /api/events/:id` return **403** when `source !== 'local'`. This generalises the existing holiday guard. Message: `"Events from external sources are read-only"`.

## OAuth flow

### Connect

1. User navigates to `/settings` **from a browser on the host machine** (or via `ssh -L 3000:localhost:3000`).
2. Clicks "Connect Google Calendar" → browser navigates to `GET /api/integrations/google/authorize`.
3. Handler builds Google consent URL with:
   - `client_id` from `GOOGLE_OAUTH_CLIENT_ID` env
   - `redirect_uri = http://localhost:3000/api/integrations/google/callback`
   - `scope = https://www.googleapis.com/auth/calendar.readonly openid email`
   - `access_type=offline`, `prompt=consent` (force refresh-token issuance)
   - `state` = random nonce stored in a short-lived cookie for CSRF protection
4. Google redirects to the callback with `?code=...&state=...`. Handler verifies state, exchanges code for `{refresh_token, access_token, expires_in, id_token}`, decodes `id_token` for `email`, upserts the `integrations` row, then calls `calendarList.list` and upserts rows into `google_calendars` with `enabled=0`.
5. Handler redirects to `/settings` — user sees connected account and the per-calendar checklist.

### Disconnect

Button on `/settings` → confirm modal showing the number of synced events that will be removed → `DELETE /api/integrations/google`:

1. Revoke the refresh token via Google's `/revoke` endpoint (best-effort; ignore network errors).
2. Delete all rows from `google_calendars` (cascade removes `events` where `source='google'`).
3. Delete the `integrations` row.

### Token refresh

Before each sync, `lib/google/client.ts` checks `accessExpiresAt`. If expired (or within 60s), it uses the refresh token to mint a new access token and persists the new expiry. Refresh-token rotation is respected — if Google returns a new refresh token, we store it.

### Required env vars (added to `.env.local.example`)

```bash
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# Redirect URI is hardcoded to http://localhost:3000/api/integrations/google/callback
# and must be registered in Google Cloud Console.
```

## Sync algorithm

Entry point: `syncGoogleCalendars(calendarIds?: string[])` in `lib/google/sync.ts`.

1. Load `integrations` row (provider='google'). If none, throw `NotConnectedError`.
2. Ensure a fresh access token (refresh if needed).
3. Determine target calendars: the `calendarIds` arg (used when a single calendar is toggled on), or all `google_calendars` where `enabled=1`.
4. For each target calendar:
   - If `syncToken` exists, call `events.list({ calendarId, syncToken })`.
   - Else, initial load: `events.list({ calendarId, timeMin: now-6mo, timeMax: now+12mo, singleEvents: false })` — recurring events as masters, matching our existing recurrence model.
   - Handle pagination (`pageToken`) until all pages drained. Capture the final `nextSyncToken`.
   - If Google returns `410 Gone` (sync token expired, typically >30 days unused), clear `syncToken` and retry this calendar as an initial load.
   - For each returned event:
     - If `status === 'cancelled'` → delete local row matching `(calendar_id, event_id)` if any.
     - Else → upsert into `events` via `(google_calendar_id, google_event_id)` unique index (see mapping below).
   - Persist `nextSyncToken` and `lastSyncAt` on the calendar row.
5. On success: set `integrations.lastSyncAt = now`, `lastSyncError = null`.
6. On failure at any step: set `integrations.lastSyncError = <message>`, leave `lastSyncAt` at its last-success value. Do not throw out of the cron job — log to stderr.

### Google → local event mapping

| Google field | Local `events` column |
|---|---|
| `id` | `googleEventId` |
| (calendar id from context) | `googleCalendarId` |
| `summary` | `title` (fallback `"(no title)"` if empty) |
| `description` | `description` |
| `location` | `location` |
| `start.dateTime` / `start.date` | `start` (UTC ISO); `allDay=1` when `.date` form |
| `end.dateTime` / `end.date` | `end` |
| `recurrence` (RRULE array) | `recurrence` via mapper below |
| — | `type = 'event'` (always) |
| — | `source = 'google'` |
| — | `color` = `google_calendars.backgroundColor` (fallback to `TYPE_COLORS.event`) |
| `colorId` | ignored |
| `attendees`, `organizer`, `hangoutLink`, etc. | not imported |

**RRULE mapping.** Google returns an array of RFC-5545 strings (e.g. `["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"]`). We detect the simple cases only:

- `FREQ=DAILY` with no other modifiers → `'daily'`
- `FREQ=WEEKLY` with no `BYDAY`/`INTERVAL`/`COUNT`/`UNTIL` → `'weekly'`
- `FREQ=MONTHLY` (simple) → `'monthly'`
- `FREQ=YEARLY` (simple) → `'yearly'`

Anything else (intervals, BYDAY, counts, exceptions) → `'none'`. Accepted edge case: complex recurring events become a single row at the master start time. Expanded instances are not fetched. Revisit if this proves painful.

### Calendar toggle semantics

`PATCH /api/integrations/google/calendars/:id` body `{ enabled: boolean }`:

- `false → true`: set `enabled=1`, trigger `syncGoogleCalendars([id])` synchronously (user gets immediate feedback; the call awaits initial load).
- `true → false`: delete all `events` rows where `googleCalendarId=id` (cascade is not enough since we're not deleting the calendar itself), null the `syncToken`, set `enabled=0`. Rationale: if re-enabled much later the token might be expired anyway, and a fresh initial load is predictable.

## Settings page

Route `/settings`, reachable from a gear icon in the calendar header.

Three cards, each its own component:

### Card 1 — Integrations (`components/settings/IntegrationsCard.tsx`)

**Google Calendar block:**
- Disconnected: "Connect Google Calendar" button + hint *"Open this page from the calendar host machine to complete sign-in."*
- Connected:
  - Header: account email, "connected since" date
  - Status line: `lastSyncAt` relative ("synced 3h ago") + "Sync now" button (disabled during in-flight sync, spinner while running)
  - Red banner if `lastSyncError` is set
  - Per-calendar checklist: checkbox, colour swatch, calendar name. Toggling ON awaits initial sync for that calendar. Toggling OFF confirms ("This will remove N events from this view") then purges.
  - "Disconnect" button at bottom, with confirm modal.

**Telegram block (read-only):**
- Bot status (based on `TELEGRAM_BOT_TOKEN` presence)
- Authorised user ID (masked)
- Mode: `webhook` (prod) vs `long-polling` (dev)
- Hint: edits require `.env.local` + restart

### Card 2 — Daily summary (`components/settings/SummaryCard.tsx`)

- Time picker (HH:MM). On save: update `app_settings['daily_summary_time']`, re-schedule the `node-cron` job in-process (no restart).
- "Regenerate today's summary" → `POST /api/summary` with today's date in `Europe/Madrid`.

### Card 3 — Appearance & defaults (`components/settings/AppearanceCard.tsx`)

- Theme radio: Light / Dark / System. System = watch `prefers-color-scheme`. Replaces current `localStorage` toggle.
- Default view radio: Month / Week / Day / Agenda.

Both persist to `app_settings`. On page load, `CalendarShell` reads them via `GET /api/settings` (SWR).

### Sidebar additions (`components/calendar/Sidebar.tsx`)

New section below the existing filters, rendered only when at least one Google calendar is `enabled`:

> **Google Calendars**
> ☑ [colour] Work
> ☑ [colour] Personal
> ☐ [colour] Birthdays shared

Unchecking hides events from that calendar client-side (same pattern as `types`/`regions`). Persisted in `localStorage` (session-local UI state, like existing filters), not in `app_settings`. Checkbox state keyed by calendar id.

## API endpoints

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/integrations/google` | — | `{ data: { connected: boolean, accountEmail?, lastSyncAt?, lastSyncError?, calendars: GoogleCalendar[] } }` | Drives the Integrations card |
| `GET` | `/api/integrations/google/authorize` | — | 302 to Google consent | Sets `state` cookie |
| `GET` | `/api/integrations/google/callback` | `?code&state` | 302 to `/settings` | Verifies state, stores tokens, fetches calendar list |
| `POST` | `/api/integrations/google/sync` | — | `{ data: { lastSyncAt, errors: string[] } }` | Manual sync; awaits completion (user clicked a button) |
| `PATCH` | `/api/integrations/google/calendars/:id` | `{ enabled: boolean }` | `{ data: GoogleCalendar }` | Triggers initial sync on enable, purge on disable |
| `DELETE` | `/api/integrations/google` | — | `{ data: { ok: true } }` | Revoke + purge |
| `GET` | `/api/settings` | — | `{ data: Record<string, string> }` | All app_settings |
| `PATCH` | `/api/settings` | `{ [key]: value }` | `{ data: Record<string, string> }` | Partial update; triggers cron reschedule if `daily_summary_time` changed |

All responses follow the existing `{ data }` / `{ error }` envelope. Error statuses: 400 (bad body), 403 (trying to mutate a non-local event), 404 (no connection), 409 (sync already in flight), 503 (Google API error).

## Cron wiring

Add one job in `lib/cron.ts`:

```ts
cron.schedule(process.env.GOOGLE_SYNC_CRON ?? '0 3 * * *', runSync, {
  timezone: 'Europe/Madrid',
})
```

`runSync` calls `syncGoogleCalendars()` inside a try/catch that logs to stderr and persists `lastSyncError`. Single-flight guard: a module-level `let syncing = false` prevents overlapping runs (manual button also respects it — returns 409 if held).

## File layout

```
app/
  settings/
    page.tsx                     # Settings route
  api/
    integrations/google/
      route.ts                   # GET status, DELETE disconnect
      authorize/route.ts         # GET → Google consent redirect
      callback/route.ts          # GET callback handler
      sync/route.ts              # POST manual sync
      calendars/[id]/route.ts    # PATCH toggle
    settings/route.ts            # GET, PATCH app_settings
components/
  settings/
    IntegrationsCard.tsx
    SummaryCard.tsx
    AppearanceCard.tsx
  calendar/
    Sidebar.tsx                  # + Google calendars section
lib/
  google/
    client.ts                    # OAuth2 client, token refresh
    sync.ts                      # syncGoogleCalendars() — the algorithm above
    mapper.ts                    # Google event → NewEvent, RRULE mapping
  settings.ts                    # typed get/set helpers over app_settings
  cron.ts                        # + google sync job, + reschedulable summary job
lib/db/
  schema.ts                      # + integrations, google_calendars, app_settings, events.{source,googleEventId,googleCalendarId}
  migrations/                    # generated
```

## Testing

Smoke tests (Vitest, existing harness):

- `mapper.test.ts`: Google event fixtures → `NewEvent` shape, including all-day, timed, RRULE simple + complex fallback, cancelled → delete signal.
- `sync.test.ts`: given a mocked Google client returning a page of events, `syncGoogleCalendars` upserts them and stores the `nextSyncToken`. Second run with `syncToken` → incremental request. `410` response clears token and re-runs.
- API route: `DELETE /api/events/:id` returns 403 when `source='google'`.
- API route: `PATCH /api/integrations/google/calendars/:id` with `enabled=false` purges events.

Manual test checklist (host machine):
- Register OAuth client, connect, verify calendar list appears.
- Toggle one calendar on, see events appear in month view.
- Edit an event in Google, click Sync now, change reflects.
- Delete an event in Google, sync, it disappears locally.
- Toggle calendar off, events removed.
- Disconnect, all Google data gone, local events untouched.
- Attempt to delete a Google event via `/api/events/:id` — 403.

## Definition of Done

- [ ] `npm run typecheck` passes
- [ ] New migrations generated and applied; `source='local'` on pre-existing events, `source='holiday'` on seeded holidays
- [ ] Holidays and Google events both return 403 on PATCH/DELETE via `/api/events/:id`
- [ ] Settings page renders all three cards in light + dark mode
- [ ] Daily summary time change reschedules the running cron without restart
- [ ] `.env.local.example` updated with `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SYNC_CRON`
- [ ] README setup section documents: creating the Google Cloud OAuth client, adding the `localhost` redirect URI, completing consent from the host machine
- [ ] Manual test checklist above passes end-to-end

## Open questions (for implementation planning, not blockers)

- Confirm the `googleapis` npm package is acceptable (adds ~1MB). Alternative: hand-rolled `fetch` calls against the REST API — slimmer but more code. Default: use `googleapis`.
- Should the sidebar remember Google-calendar visibility checkboxes per-device (`localStorage`) or globally (`app_settings`)? Design currently says `localStorage` to match existing filter pattern. Easy to flip later.
