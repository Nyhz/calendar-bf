# SPEC.md — Calendar App

Feature specifications for all major features.
Authoritative reference for implementation. Repository is pre-implementation.

---

## Table of Contents

1. [Calendar UI](#1-calendar-ui)
2. [Event Management](#2-event-management)
3. [Sidebar](#3-sidebar)
4. [Spanish Holidays](#4-spanish-holidays)
5. [Telegram Bot](#5-telegram-bot)
6. [Voice Message Handling](#6-voice-message-handling)
7. [AI Daily Summaries](#7-ai-daily-summaries)
8. [Dark Mode](#8-dark-mode)
9. [API Endpoints](#9-api-endpoints)
10. [Error Handling Specifications](#10-error-handling-specifications)
11. [Edge Cases and Constraints](#11-edge-cases-and-constraints)
12. [Future Features / Backlog](#12-future-features--backlog)

---

## 1. Calendar UI

### 1.1 Views

The app supports four views, switchable via tabs/buttons in the header:

| View | Description |
|---|---|
| Month | Full month grid, events shown as chips |
| Week | 7-column time grid (00:00–24:00), events as positioned blocks |
| Day | Single-column time grid for the selected day |
| Agenda | Scrollable list of upcoming events grouped by date |

**Active view persists** in URL query param `?view=month|week|day|agenda` so
deep-linking works and the browser back button behaves correctly.

**Selected date** persists in URL as `?date=YYYY-MM-DD`.

### 1.2 Month View

- 6-row × 7-column grid. First column: Monday (European convention).
- Each cell shows the day number.
- Events rendered as horizontal chips (truncated title + color dot).
- If a day has more events than fit: show "+N more" link that opens agenda for that day.
- Today's cell has a highlighted background.
- Clicking a **cell** opens the quick event creation popover pre-filled with that date.
- Clicking an **event chip** opens the event popover (see §2.3).
- Navigation: prev/next month arrows + "Today" button.

### 1.3 Week View

- Time grid: rows at 30-minute intervals, columns for each day of the week.
- All-day events shown in a fixed strip above the time grid.
- Events positioned by their start/end time (absolute position within the column).
- Overlapping events are shown side-by-side (shrink width, offset columns).
- **Click on empty time slot** → creates event with that day + time pre-filled.
- **Click and drag on empty time slot** → creates event spanning the dragged range.
- Clicking an event block opens the event popover.
- Current time indicator: red horizontal line in today's column.
- Navigation: prev/next week arrows + "Today" button.
- Week starts on Monday.

### 1.4 Day View

- Single-column time grid, same row height as Week View.
- All-day events in a strip at top.
- Click/drag behavior identical to Week View but for the single day.
- Navigation: prev/next day arrows + "Today" button.

### 1.5 Agenda View

- Infinite-scroll (or paginated) list of future events starting from the selected date.
- Grouped by date with a date header (e.g., "Lunes, 7 de abril de 2026").
- Each event row: color dot, title, time range, type badge.
- Clicking an event row opens the event popover.
- Empty state: "No hay eventos próximos."
- Navigation: date picker to jump to a specific date.

### 1.6 Header

```
[ < ] [ Today ] [ > ]   "Abril 2026"   [Month][Week][Day][Agenda]   [+]   [🌙]
```

- `<` / `>`: navigate prev/next period for the active view.
- `Today`: jump to current date.
- Period label: updates based on active view (month name, week range, day).
- View tabs: switch views.
- `[+]`: floating action button — opens full event creation form (no pre-fill).
- `[🌙]`: dark mode toggle.

---

## 2. Event Management

### 2.1 Event Creation — Quick (Click on Cell/Slot)

Triggered by clicking a day cell (Month View) or time slot (Week/Day View).

Behavior:
- Opens a lightweight inline popover/tooltip (not a modal).
- Pre-fills: date from clicked cell, time from clicked slot (rounded to nearest 30 min).
- Fields: title (text input, focused on open), date/time display (read-only in quick form).
- Submit: creates event with defaults (`type=event`, default color, no recurrence).
- "More options" link → upgrades to the full event form, preserving entered title.

### 2.2 Event Creation — Full Form

Triggered by: floating `[+]` button, "More options" from quick form, or editing an event.

Modal dialog with the following fields:

| Field | Type | Validation |
|---|---|---|
| Title | text input | required, max 255 chars |
| Start datetime | datetime-local | required |
| End datetime | datetime-local | required, must be ≥ start |
| All-day toggle | toggle | if on, hides time pickers |
| Type | select | event / meeting / birthday / reminder |
| Color | color picker | defaults to type default color, overridable |
| Description | textarea | optional |
| Location | text input | optional |
| Recurrence | select | none / daily / weekly / monthly / yearly |

- Submitting a **new** event: `POST /api/events` → 201 → close modal, refresh view.
- Submitting an **edit**: `PATCH /api/events/:id` → 200 → close modal, refresh view.
- "Cancel" button discards changes.
- When editing a recurring event: warn "This will modify all occurrences." (single vs. all
  recurrence editing is a future feature — for now, edit modifies the base record only).

### 2.3 Event Popover (Click on Existing Event)

Small popover anchored to the event chip/block. Contents:

```
[Color dot] Title
            📅 Mon, 7 Apr 2026 · 10:00–11:00
            📍 Location (if set)
            📝 Description excerpt (2 lines, truncated)
            ─────────────────────────────────────
            [✏️ Edit]  [🗑️ Delete]  [✕ Close]
```

- `Edit` → opens full event form pre-filled.
- `Delete` → confirmation dialog ("¿Eliminar este evento?") → `DELETE /api/events/:id`
  → close popover, refresh view.
- `Close` (or click outside) → dismiss popover.

### 2.4 Click-and-Drag Event Creation

In Week and Day views:
- Press on an empty time slot and drag down to select a time range.
- Visual highlight shows the selected range during drag.
- On mouse-up: open quick creation form (§2.1) with start/end pre-filled from the range.
- Minimum drag length: 30 minutes.

### 2.5 Event Display Rules

- Events are filtered by the sidebar toggles (type visibility + holiday region visibility).
- Filtered-out events are not rendered — they are excluded from the DOM entirely.
- Holiday events (type = `holiday`) cannot be edited or deleted from the UI.

---

## 3. Sidebar

Always visible alongside the main calendar view (collapsible on small screens).

### 3.1 Mini Calendar

- Full-month grid (same layout as Month View, but compact — ~220px wide).
- Clicking a date sets the active date in the main view.
- Highlights today, highlights the currently selected date.
- Prev/next month navigation.
- Does not independently filter events.

### 3.2 Event Type Filters

Checkbox list controlling which event types are visible in the main view:

```
☑ Eventos        (blue)
☑ Reuniones      (green)
☑ Cumpleaños     (purple)
☑ Recordatorios  (yellow)
```

- State stored in `localStorage` so it survives page reload.
- Default: all checked.

### 3.3 Holiday Region Toggles

Toggle switches (not checkboxes) for holiday visibility:

```
⬛ Nacionales           [ON]
⬛ País Vasco (ES-PV)   [OFF]
⬛ Madrid (ES-MD)       [OFF]
```

- State stored in `localStorage`.
- Default: Nacionales ON, regional OFF.
- Only one regional set should be enabled at a time (UX recommendation, not a hard
  constraint — allowing both is acceptable).
- When toggled ON, the corresponding holidays appear in the main view immediately
  (client-side filter, no refetch required if holidays are already in cache).

---

## 4. Spanish Holidays

### 4.1 Data Source

Nager.Date API — no API key required.

```
GET https://date.nager.at/api/v3/PublicHolidays/{year}/ES
```

Response shape (relevant fields):

```json
[
  {
    "date": "2026-01-01",
    "localName": "Año Nuevo",
    "name": "New Year's Day",
    "global": true,
    "counties": null
  },
  {
    "date": "2026-01-20",
    "localName": "Día de San Sebastián",
    "name": "Saint Sebastian's Day",
    "global": false,
    "counties": ["ES-PV"]
  }
]
```

### 4.2 Classification

| Condition | Stored `region` |
|---|---|
| `global === true` | `national` |
| `counties` includes `ES-PV` | `ES-PV` |
| `counties` includes `ES-MD` | `ES-MD` |
| Neither (other region) | Skip — do not store |

A holiday may appear in multiple counties. If a holiday is national (`global: true`),
it is stored once as `national`. If it is not global but is in both ES-PV and ES-MD
counties, store it as two rows (one per region).

### 4.3 Seed Logic

```
On app startup (Next.js instrumentation hook or first API call to /api/holidays):

1. Determine current year (Europe/Madrid).
2. Query: SELECT COUNT(*) FROM events WHERE type='holiday' AND start LIKE '{year}%'
3. If count === 0:
   a. Fetch from Nager.Date API
   b. Filter and transform to DB rows
   c. Bulk INSERT into events table
4. If count > 0: skip (already seeded for this year)
```

Seed runs once per year. No UI to trigger re-seed (logs will show seed activity).

### 4.4 Holiday Event Properties

When seeding, set:

```ts
{
  title: holiday.localName,         // Spanish name
  start: `${holiday.date}T00:00:00Z`,
  end: `${holiday.date}T23:59:59Z`,
  all_day: 1,
  type: 'holiday',
  color: '#EF4444',                 // red-500
  region: 'national' | 'ES-PV' | 'ES-MD',
}
```

---

## 5. Telegram Bot

### 5.1 Authorization

Every incoming message/callback is checked against `TELEGRAM_AUTHORIZED_USER_ID`.
If `ctx.from.id !== authorizedId` → silently ignore (no response, no error sent).

### 5.2 Commands

| Command | Behavior |
|---|---|
| `/hoy` | List today's events (Europe/Madrid date) |
| `/mañana` | List tomorrow's events |
| `/semana` | List all events in the current week (Mon–Sun, Madrid time) |

Response format for event lists:

```
📅 *Lunes, 7 de abril de 2026*

• 10:00 — Dentista
• 14:30 — Reunión de equipo
• Todo el día — Festivo Nacional

_No hay más eventos hoy._
```

Empty state: `"No hay eventos para [hoy/mañana/esta semana]."`

### 5.3 Natural-Language Event Creation (Text)

Any non-command text message is treated as a natural-language event description.

Flow:

1. Receive message text (e.g., "Dentista el jueves a las 10").
2. Spawn Claude Code subprocess with system prompt instructing it to parse the text
   into a structured event JSON relative to today's date in Europe/Madrid timezone.
3. Claude returns JSON:
   ```json
   {
     "title": "Dentista",
     "start": "2026-04-09T10:00:00+02:00",
     "end": "2026-04-09T11:00:00+02:00",
     "all_day": false,
     "type": "event",
     "description": null,
     "location": null
   }
   ```
4. Bot sends a confirmation message with inline keyboard:

```
📅 *Dentista*
Jueves, 9 de abril · 10:00–11:00

¿Confirmar este evento?
[✅ Confirmar]  [✏️ Editar]  [❌ Cancelar]
```

5. User taps a button → `callback_query` handler:
   - **Confirmar**: `POST /api/events` → "✅ Evento guardado."
   - **Editar**: Bot sends a follow-up message asking for a corrected description, then re-parses.
   - **Cancelar**: "❌ Cancelado." — no event saved.

### 5.4 Claude Parsing System Prompt

```
You are a calendar assistant. Parse the user's message into a structured event.
Today is {today} in the Europe/Madrid timezone (UTC+1/UTC+2).
Return ONLY valid JSON matching this schema — no prose, no markdown fences:
{
  "title": string,
  "start": string (ISO 8601 with timezone offset),
  "end": string (ISO 8601 with timezone offset, default +1 hour from start),
  "all_day": boolean,
  "type": "event" | "meeting" | "birthday" | "reminder",
  "description": string | null,
  "location": string | null
}
If the message cannot be parsed into an event, return: {"error": "unparseable"}
```

If Claude returns `{"error": "unparseable"}`, bot replies:
`"No he podido entender eso como un evento. Intenta con: 'Dentista el jueves a las 10'."`

### 5.5 Edit Flow

When the user taps ✏️ Editar:

1. Bot: "¿Cómo quieres modificarlo? Escribe la descripción corregida."
2. Next text message from the authorized user is treated as a correction (bot enters
   a per-user "editing" state stored in memory, keyed by chat ID).
3. Re-run through Claude parsing (same flow as §5.3).
4. State is cleared after Confirmar or Cancelar.

---

## 6. Voice Message Handling

### 6.1 Flow

1. Bot receives a voice message (`message.voice`).
2. Download the OGG/Opus file via Telegram Bot API `getFile` + file URL.
3. Save temporarily to `/tmp/voice_{timestamp}.ogg`.
4. Invoke Whisper to transcribe:
   - mlx-whisper: `mlx_whisper /tmp/voice_{timestamp}.ogg --model {WHISPER_MODEL}`
   - whisper.cpp: `./whisper.cpp/main -m models/ggml-{WHISPER_MODEL}.bin -f /tmp/voice_{timestamp}.ogg`
5. Parse Whisper stdout for the transcription text.
6. Delete the temp file.
7. Treat the transcription as a text message → continue with §5.3 flow.
8. If transcription fails or returns empty: reply
   `"No pude transcribir el audio. Intenta enviar un mensaje de texto."`

### 6.2 Whisper Backend Selection

- Controlled by `WHISPER_BACKEND` env var: `mlx-whisper` (Apple Silicon) or `whisper.cpp`.
- `lib/whisper.ts` exposes a single `transcribe(filePath: string): Promise<string>` function
  that dispatches based on the env var.

---

## 7. AI Daily Summaries

### 7.1 Cron Job

Scheduled via node-cron using `DAILY_SUMMARY_CRON` env var (default `0 8 * * *`).
Executes in the Europe/Madrid timezone context.

Job steps:

1. Fetch today's events (Europe/Madrid date) from DB.
2. Fetch tomorrow's events.
3. Fetch events with `type='birthday'` within the next 3 days.
4. Build a plain-text context block:
   ```
   HOY ({date}): [list of events]
   MAÑANA ({date}): [list of events]
   PRÓXIMOS CUMPLEAÑOS: [list]
   ```
5. Spawn Claude Code with a system prompt instructing a friendly Spanish summary.
6. Store result in `summaries` table (upsert by date).
7. Send the summary text via Telegram to the authorized user.

### 7.2 Claude Summary System Prompt

```
Eres un asistente de calendario personal. Genera un resumen amigable y conciso
en español del día para el usuario. Usa un tono cálido y cercano. 
Incluye: eventos de hoy, una mención de mañana, y recuerda los cumpleaños próximos.
Máximo 3 párrafos. No uses markdown ni listas — prosa natural.
```

### 7.3 Summary UI

A banner card appears at the top of the calendar page (above the main view area).

Layout:
```
┌─────────────────────────────────────────────────────────┐
│ 📋 Resumen del día                      [🔄 Regenerar]  │
│                                                          │
│ Hoy tienes una reunión a las 10 y el dentista a las 15. │
│ Mañana tienes el día libre. ¡Feliz cumpleaños a María   │
│ en 2 días!                                              │
│                                         Generado 08:00  │
└─────────────────────────────────────────────────────────┘
```

- Displayed when a summary exists for today.
- Hidden with a subtle collapsed state if no summary yet ("Aún no hay resumen para hoy").
- **[🔄 Regenerar]** button: `POST /api/summary` → regenerates the summary → updates the banner.
- Regeneration shows a loading spinner on the button while running.

### 7.4 Summary Fetch

On calendar page load: `GET /api/summary?date=YYYY-MM-DD` returns today's summary or 404.

---

## 8. Dark Mode

- Toggle button in the header (sun/moon icon).
- Implementation: toggle `dark` class on `<html>` element.
- State persisted in `localStorage` key `theme`: `'dark'` | `'light'`.
- Respects system preference as initial default if no `localStorage` value.
- All components must have `dark:` variants for backgrounds, text, borders.
- Color palette:
  - Light: white backgrounds, gray-800 text.
  - Dark: gray-900 backgrounds, gray-100 text, gray-700 borders.

---

## 9. API Endpoints

All endpoints return `Content-Type: application/json`.

### 9.1 Events

#### `GET /api/events`

Query params:

| Param | Type | Description |
|---|---|---|
| `start` | ISO date string | Filter events starting on or after this date |
| `end` | ISO date string | Filter events ending on or before this date |
| `types` | comma-separated | Filter by event type(s) |
| `regions` | comma-separated | Filter by holiday region(s) |

Response `200`:
```json
{ "data": [Event, ...] }
```

Notes:
- Recurring events are expanded within the requested range.
- Holidays are included unless excluded by `types` filter.

#### `POST /api/events`

Body: Event fields (all optional except `title`, `start`, `end`).

Response `201`:
```json
{ "data": Event }
```

Error `400`:
```json
{ "error": "Validation error: end must be after start" }
```

#### `GET /api/events/:id`

Response `200`: `{ "data": Event }` or `404`: `{ "error": "Not found" }`

#### `PATCH /api/events/:id`

Body: Partial event fields.

Response `200`: `{ "data": Event }` or `404`.

#### `DELETE /api/events/:id`

Response `204` (no body) or `404`.

Constraint: holidays (`type='holiday'`) cannot be deleted — return `403`:
```json
{ "error": "Holiday events cannot be deleted" }
```

### 9.2 Holidays

#### `GET /api/holidays`

Query params: `year` (integer, defaults to current year).

Triggers seed if no holidays for that year exist in DB.

Response `200`:
```json
{ "data": [Event, ...] }
```

### 9.3 Summary

#### `GET /api/summary`

Query params: `date` (YYYY-MM-DD, defaults to today in Madrid timezone).

Response `200`: `{ "data": Summary }` or `404`: `{ "error": "No summary for this date" }`

#### `POST /api/summary`

Body: `{ "date": "YYYY-MM-DD" }` (optional, defaults to today).

Triggers regeneration (fetches events, calls Claude, upserts DB, returns new summary).

Response `200`: `{ "data": Summary }`

May return `503` if Claude subprocess fails:
```json
{ "error": "Summary generation failed. Try again later." }
```

### 9.4 Telegram Webhook

#### `POST /api/telegram/webhook`

Receives Telegram update objects. No response body needed — returns `200` immediately.

Authentication: Telegram sends updates only to the registered webhook URL.
Optional: validate `X-Telegram-Bot-Api-Secret-Token` header if configured.

---

## 10. Error Handling Specifications

### API Errors

| Scenario | Status | Response |
|---|---|---|
| Invalid request body | 400 | `{ "error": "..." }` |
| Resource not found | 404 | `{ "error": "Not found" }` |
| Forbidden operation | 403 | `{ "error": "..." }` |
| External API failure (Nager.Date) | 502 | `{ "error": "Holiday API unavailable" }` |
| AI subprocess failure | 503 | `{ "error": "AI service unavailable" }` |
| Unexpected server error | 500 | `{ "error": "Internal server error" }` |

### Bot Errors

| Scenario | Bot Response |
|---|---|
| Whisper transcription fails | "No pude transcribir el audio. Intenta con texto." |
| Claude parsing returns `{"error":"unparseable"}` | "No entendí eso como un evento. Ej: 'Reunión el lunes a las 15'." |
| Claude subprocess crashes | "Hubo un problema procesando tu mensaje. Inténtalo de nuevo." |
| DB write fails | "Error al guardar el evento. Inténtalo de nuevo." |

### UI Errors

- Failed event fetch: show "Error cargando eventos." inline in the view with a Retry button.
- Failed event creation/edit: show toast notification with error message.
- Failed summary fetch: silently hide the summary banner (do not show an error card).

---

## 11. Edge Cases and Constraints

### Dates & Times

- All-day events: `start` and `end` stored as `YYYY-MM-DDT00:00:00Z`. UI shows date only.
- Events spanning midnight: valid — end > start, may span multiple days.
- Events with identical start/end: treated as zero-duration (instantaneous), displayed as a point marker.
- Past events: displayed normally. No restriction on creating events in the past.

### Recurrence

- Recurrence expansion capped at 2 years beyond the query end date to avoid infinite loops.
- If a recurring event's expanded occurrence falls on the same date as a holiday, both are shown independently.

### Holidays

- If Nager.Date API is unreachable on startup, log the failure and continue without seeding. The app remains functional; holidays simply won't appear until the next successful seed.
- Do not re-fetch holidays if they already exist for the year, even if `GET /api/holidays` is called multiple times.
- If a holiday's `counties` array contains a region other than ES-PV or ES-MD, skip it.

### Telegram Bot

- If the same user sends multiple messages rapidly, each is processed independently (no deduplication).
- The "editing" state (§5.5) is in-memory. If the server restarts during an edit flow, the state is lost. The user must start over — no explicit handling needed.
- Voice files > 20 MB are rejected by Telegram before reaching the bot (Telegram limit).

### Summary Generation

- If no events exist for today or tomorrow, Claude should still generate a short friendly note ("Tienes el día libre.").
- If the cron job runs but a summary already exists for today (e.g., manually regenerated earlier), the cron job upserts (overwrites) the existing summary.

---

## 12. Future Features / Backlog

These were not in the Commander's initial briefing but are natural extensions.
Do not implement without explicit orders.

- **Multi-user support**: currently single-user by design.
- **Per-occurrence recurrence editing**: "edit this event only" vs. "edit all" for recurring events.
- **Event invitations / sharing**: send event details to others via Telegram.
- **iCal import/export**: `.ics` file support.
- **Google Calendar sync**: two-way sync via Google Calendar API.
- **Push notifications**: browser push for event reminders.
- **Drag-to-reschedule**: drag existing events to a new time slot.
- **Resize-to-extend**: drag the bottom edge of an event block to change its end time.
- **Additional holiday regions**: support more Spanish autonomous communities.
- **Multi-year holiday seeding**: pre-seed next year's holidays in December.
- **Summary history**: view past daily summaries in a dedicated page.
- **Natural-language date navigation**: "show me next month" in the bot.
