# SPEC.md — Feature Specifications

> Authoritative behavioral specification for all features.
> Read this before implementing anything. When spec conflicts with intuition, spec wins.

---

## Table of Contents

1. [Calendar UI](#1-calendar-ui)
2. [Event Management](#2-event-management)
3. [Sidebar](#3-sidebar)
4. [Spanish Holidays](#4-spanish-holidays)
5. [Telegram Bot](#5-telegram-bot)
6. [Voice Message Handling](#6-voice-message-handling)
7. [AI Daily Summary](#7-ai-daily-summary)
8. [Dark Mode](#8-dark-mode)
9. [API Specification](#9-api-specification)
10. [Error Handling](#10-error-handling)
11. [Edge Cases and Constraints](#11-edge-cases-and-constraints)
12. [Backlog / Future Features](#12-backlog--future-features)

---

## 1. Calendar UI

### 1.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [SummaryBanner — hidden until a summary exists]                  │
├──────────────────────────────────────────────────────────────────┤
│ HEADER: ← April 2025 → [Today] [Month|Week|Day|Agenda] [+] [☾]  │
├──────────┬───────────────────────────────────────────────────────┤
│ SIDEBAR  │  CALENDAR VIEW (MonthView / WeekView / DayView /      │
│          │  AgendaView)                                          │
│ MiniCal  │                                                       │
│          │                                                       │
│ Filters  │                                                       │
│          │                                                       │
│ Holidays │                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

- Sidebar width: fixed ~280px, not resizable.
- Header sticks to top; calendar area scrolls independently.
- Floating `[+]` button (FAB) always visible bottom-right.

### 1.2 URL State

Active view and date are reflected in URL query params:

- `?view=month&date=2025-04-01`
- Deep-linking works — sharing the URL opens the same view/date.
- Browser back/forward navigates between date changes.
- Defaults: `view=month`, `date=<today in Europe/Madrid>`.

### 1.3 Month View

- 6-row × 7-column grid, Monday first.
- Day numbers in top-right of each cell. Current day highlighted with a circle/pill.
- Days outside the current month displayed in muted color, still clickable.
- Events render as chips (colored left-border or full-color pill, title truncated).
- If more than N events fit in a cell, show `+N more` link; clicking expands a popover listing all.
- All-day events and holidays span the full cell width.

**Interactions:**
- Click empty area of a day cell → open quick-create popover with that date pre-filled.
- Click an event chip → open EventPopover.
- Click `+N more` → open day popover listing all events for that day.

### 1.4 Week View

- 7-column grid, Monday first, current day column highlighted.
- All-day strip at top spanning all 7 columns.
- Time grid below: 24 hours, rows every 30 minutes.
- Current time indicator: a red horizontal line at the current time (live, updates every minute).
- Overlapping events: displayed side-by-side, equal-width columns within the time slot.

**Interactions:**
- Click empty time slot → open EventForm with start time pre-filled (rounded to nearest 30 min).
- Click and drag downward → select time range; release opens EventForm with start+end pre-filled.
- Click event → open EventPopover.

### 1.5 Day View

- Single column time grid identical to Week View but for one day.
- Date shown prominently in the header area.

### 1.6 Agenda View

- Scrollable list of upcoming events, grouped by date.
- Date headers (e.g., "Lunes 7 de abril") above each group.
- Skip days with no events.
- Show events from today onward, loading more as user scrolls (or show a fixed window of 30 days).
- Each row: colored dot, time range (or "Todo el día"), title, location if set.
- Click event row → EventPopover.

### 1.7 Header Controls

| Control | Behavior |
|---|---|
| `←` / `→` arrows | Navigate prev/next period (month, week, or day depending on view) |
| `Today` button | Jump to current date in current view |
| View tabs `Month \| Week \| Day \| Agenda` | Switch view, preserve active date |
| `[+]` button | Open full EventForm (create mode, no date pre-fill) |
| `[☾]` (dark mode toggle) | Toggle dark/light, persist in localStorage |

---

## 2. Event Management

### 2.1 Event Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | string | Yes | — | Max 255 chars |
| `start` | datetime | Yes | — | ISO UTC stored |
| `end` | datetime | Yes | — | Must be ≥ start |
| `allDay` | boolean | No | false | Hides time inputs when true |
| `type` | enum | No | `event` | event / meeting / birthday / reminder |
| `color` | hex string | No | type default | Pre-filled from TYPE_COLORS[type] |
| `description` | string | No | — | Free text |
| `location` | string | No | — | Free text |
| `recurrence` | enum | No | `none` | none / daily / weekly / monthly / yearly |

Note: `type: 'holiday'` and `region` field are system-only — not available in the UI form.

### 2.2 EventForm (Create / Edit)

Full form with all fields. Opened via:
- FAB `[+]`
- "Edit" button in EventPopover
- Telegram bot edit flow

Behavior:
- When `allDay` is toggled ON: hide time pickers, set start to `00:00`, end to `23:59`.
- When `type` changes: auto-update `color` to `TYPE_COLORS[newType]` unless user has manually changed color.
- `end` datetime picker enforces `end >= start` (disable or clamp earlier values).
- Recurrence selector: dropdown None / Daily / Weekly / Monthly / Yearly.
- Submit calls `POST /api/events` (create) or `PATCH /api/events/:id` (edit).
- On success: close form, invalidate SWR cache for events in visible range.
- On error: show inline error message, do not close form.

### 2.3 Quick-Create Popover

**Status: Not yet implemented.** Currently, clicking a day/time cell opens the full EventForm with the date pre-filled. The quick-create popover (minimal inline form with just title + pre-filled date and a "More options" link) is a future enhancement.

Spec (when implemented): Minimal form triggered by clicking a day/time cell. Fields: title (required), date/time (pre-filled). Submit creates event with type defaults. A "More options" link opens the full EventForm.

### 2.4 EventPopover

Shown when clicking an existing event. Content:

```
┌─────────────────────────────── [✕] ┐
│ ● [color dot] TITLE                  │
│ Apr 15, 10:00 – 11:00                │
│ 📍 Location (if set)                 │
│ 📝 Description (if set)              │
│                                      │
│ [✏️ Editar]        [🗑️ Eliminar]    │
└──────────────────────────────────────┘
```

- "Editar" opens EventForm in edit mode pre-populated with event data.
- "Eliminar" shows a confirmation prompt, then calls `DELETE /api/events/:id`.
- Holidays: show "Festivo" badge; hide Edit/Delete buttons.
- Dismiss by clicking outside or pressing Escape.

### 2.5 Drag-to-Create (Week/Day View)

1. Mouse down on empty time slot → start selection.
2. Drag downward → highlight selection range.
3. Mouse up → open EventForm with start/end pre-filled.
4. If user drags up or to another day, cancel the selection.

### 2.6 Recurrence Logic

- Recurring events stored as one DB row.
- API `GET /api/events?start=&end=` expands recurrences in the response.
- Expansion algorithm: starting from `event.start`, generate occurrences until `end` param.
- Each generated occurrence has `id: "${baseId}_${YYYY-MM-DD}"`.
- `PATCH` / `DELETE` on a recurring event always affects the base record (all occurrences).

---

## 3. Sidebar

### 3.1 Mini Calendar

- Compact month grid (~220px wide, ~200px tall).
- Shows current month by default; prev/next arrows to navigate months independently from main view.
- Click any day: set main calendar's active date to that day (and switch to Day View if in month view? — only change the active date, keep view).
- Highlight: today with circle, currently selected date with filled circle.

### 3.2 Event Type Filters

Checkboxes for:
```
☑ Eventos       (blue dot)
☑ Reuniones     (green dot)
☑ Cumpleaños    (purple dot)
☑ Recordatorios (yellow dot)
```

- All checked by default.
- Unchecking a type hides those events from all views (they are not fetched, or filtered client-side — prefer filtering at API query param level).
- State persisted in `localStorage` under key `calendar_type_filters`.

### 3.3 Holiday Region Toggles

Toggle switches (not checkboxes) for:
```
● Nacionales       [ON]
○ País Vasco       [OFF]
○ Madrid           [OFF]
```

- Default: National ON, regional OFF.
- These filter by the `region` field on holiday events.
- State persisted in `localStorage` under key `calendar_holiday_regions`.
- When a region is toggled OFF, holidays of that region disappear from all views.
- Multiple regions can be active simultaneously.

---

## 4. Spanish Holidays

### 4.1 Data Source

```
GET https://date.nager.at/api/v3/PublicHolidays/{year}/ES
```

Response is an array of objects with at minimum:
- `date`: `"YYYY-MM-DD"`
- `localName`: Spanish name (e.g., `"Año Nuevo"`)
- `global`: `true` if national
- `counties`: array of region codes (e.g., `["ES-PV"]`) or `null`

No API key required.

### 4.2 Classification

| Condition | Stored `region` |
|---|---|
| `global === true` | `"national"` |
| `counties` includes `"ES-PV"` | `"ES-PV"` |
| `counties` includes `"ES-MD"` | `"ES-MD"` |
| Any other regional holiday | Skip — not imported |

A holiday with `global === true` is stored as `national` regardless of `counties`.

### 4.3 Holiday Event Properties

```ts
{
  title:       holiday.localName,
  start:       `${holiday.date}T00:00:00Z`,
  end:         `${holiday.date}T23:59:59Z`,
  allDay:      1,
  type:        'holiday',
  color:       '#EF4444',   // red-500
  region:      'national' | 'ES-PV' | 'ES-MD',
  description: null,
  location:    null,
  recurrence:  'none',
}
```

### 4.4 Seed Logic

- On app startup (or first `GET /api/holidays` call), check if holidays for the current year exist.
- Check: `SELECT COUNT(*) FROM events WHERE type = 'holiday' AND start LIKE 'YYYY-%'`.
- If count = 0: fetch from Nager.Date, filter + transform, bulk insert.
- If count > 0: skip — no re-seed.
- Seed for the current year only on startup. Fetching a future/past year is on-demand via `GET /api/holidays?year=YYYY`.

### 4.5 Constraints

- Holidays cannot be created, edited, or deleted via the Events API (returns 403).
- Holidays are always all-day.
- Holiday region field is read-only after creation.

---

## 5. Telegram Bot

### 5.1 Authorization

- Every incoming update (message, callback, command) is checked against `TELEGRAM_AUTHORIZED_USER_ID`.
- If `update.from.id !== authorizedUserId`: silently ignore (no reply).
- No error message sent to unauthorized users.

### 5.2 Commands

| Command | Response |
|---|---|
| `/start` | Welcome message with usage instructions (in Spanish). |
| `/today` | List of today's events. If none: "No tienes eventos programados para hoy. 🎉" |
| `/summary` | Generates an AI daily summary (weekly on Mondays) via Claude and sends it. |

Event list format:
```
📅 Eventos de hoy:

• 10:00 — Reunión con equipo
• 15:30 — Dentista — 📍 Clínica Centro
• Todo el día — Festivo Nacional
```

### 5.3 Natural-Language Event Creation (Text)

1. User sends any non-command text (e.g., `"Dentista el jueves a las 10"`).
2. Bot passes message to Claude subprocess with event-parsing system prompt.
3. Claude returns structured JSON:
   ```json
   {
     "title": "Dentista",
     "start": "2025-04-10T10:00:00Z",
     "end": "2025-04-10T11:00:00Z",
     "type": "event",
     "allDay": false,
     "location": null,
     "description": null
   }
   ```
4. Bot sends confirmation message with inline keyboard:
   ```
   📅 Dentista
   Jueves 10 de abril, 10:00 – 11:00
   
   [✅ Confirmar]  [✏️ Editar]  [❌ Cancelar]
   ```
5. User presses **Confirmar** → `POST /api/events` → "✅ Evento guardado."
6. User presses **Cancelar** → "Cancelado." No event created.
7. User presses **Editar** → Bot asks for each field in sequence (see §5.4).

**Claude system prompt for parsing:**
```
You are an assistant that parses Spanish natural-language event descriptions into JSON.
Return ONLY valid JSON with fields: title, start (ISO 8601 UTC, timezone Europe/Madrid), 
end (ISO 8601 UTC), type (event|meeting|birthday|reminder), allDay (boolean), 
location (string|null), description (string|null).
Today is {currentDate}. If no year is mentioned, assume the nearest future date.
If no duration is mentioned, assume 1 hour.
```

**If Claude fails or returns invalid JSON:** reply "No pude entender el evento. Por favor, intenta de nuevo."

### 5.4 Telegram Edit Flow

When user presses ✏️ Editar:
1. Bot asks: "¿Qué título quieres? (actual: {title})" — user can reply or send "-" to keep.
2. Bot asks: "¿Fecha y hora de inicio?" — user can reply or "-".
3. Bot asks: "¿Fecha y hora de fin?" — user can reply or "-".
4. Bot asks: "¿Tipo? (event/meeting/birthday/reminder)" — user can reply or "-".
5. After all fields collected, show confirmation again (step 4 of §5.3 flow).

State machine is in-memory (Map keyed by chat_id). Lost on server restart.

### 5.5 Voice Messages

See §6.

### 5.6 Inline Keyboard Callbacks

Callback data format: `confirm:{tempId}`, `edit:{tempId}`, `cancel:{tempId}`.

`tempId` is a short-lived UUID stored in-memory alongside the parsed event JSON. Expires after 30 minutes or on first use.

---

## 6. Voice Message Handling

1. User sends voice message (OGG/Opus format from Telegram).
2. Bot downloads audio file from Telegram servers.
3. Saves to temp file: `/tmp/tg_voice_{timestamp}.ogg`.
4. Invokes Whisper:
   ```bash
   # mlx-whisper
   mlx_whisper --model {WHISPER_MODEL} --language Spanish {tempFile}
   
   # whisper.cpp
   whisper-cli -m models/{WHISPER_MODEL}.bin -l es {tempFile}
   ```
5. Reads transcription from stdout.
6. Deletes temp file.
7. Treats transcription as a text message — passes to Claude for event parsing (§5.3 step 2 onward).
8. If transcription is empty or Whisper fails: reply "No pude transcribir el audio. Por favor, envía un mensaje de texto."

---

## 7. AI Daily Summary

### 7.1 Cron Schedule

- Default: `0 8 * * *` (8:00 AM, node-cron, Madrid timezone via `tz` option).
- Override via `DAILY_SUMMARY_CRON` env var.
- Runs in the Next.js process via `lib/cron.ts` which is imported in a server-side initializer.

### 7.2 Summary Generation

1. Fetch today's events (full day, Madrid tz).
2. On Mondays: also fetch the rest of the week's events (Tue–Sun) for a weekly briefing.
3. Pass events as JSON to Claude subprocess with a Spanish summary system prompt.
4. Claude generates a concise summary in Spanish (daily or weekly depending on day).
5. Upsert result to `summaries` table: `INSERT OR REPLACE INTO summaries (date, content, generated_at)`.
6. Send summary text via Telegram to authorized user.

### 7.3 Summary Banner (UI)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Resumen del día                           [🔄 Regenerar]     │
│                                                                   │
│ Hoy tienes una reunión a las 10 y el dentista a las 15:30.       │
│ Mañana es festivo. ¡Recuerda que es el cumpleaños de María       │
│ en 2 días!                                                        │
│                                             Generado: 08:00      │
└───────────────────────────────────────────────────────────────────┘
```

- Fetched via `GET /api/summary?date=YYYY-MM-DD` (today in Madrid tz).
- Hidden if API returns 404 (no summary yet).
- `[🔄 Regenerar]` button calls `POST /api/summary { date }` with loading spinner.
- On regeneration success: update banner content, update timestamp.
- On regeneration failure (503): show inline error "No se pudo regenerar el resumen."
- Positioned above the calendar header.

---

## 8. Dark Mode

- Toggle button in header (moon/sun icon).
- Adds/removes `dark` class on `<html>` element.
- Tailwind `darkMode: 'class'` — all dark variants activated by this class.
- Preference stored in `localStorage` key `calendar_theme`.
- On initial load: read `localStorage`, apply before first render to prevent flash.
- Default: system preference (`prefers-color-scheme`), falling back to light if not set.

---

## 9. API Specification

### 9.1 GET /api/events

Query parameters:

| Param | Type | Required | Description |
|---|---|---|---|
| `start` | ISO 8601 | Yes | Range start (UTC) |
| `end` | ISO 8601 | Yes | Range end (UTC) |
| `types` | csv | No | e.g. `event,meeting,birthday` |
| `regions` | csv | No | e.g. `national,ES-PV` |

Response `200`:
```json
{
  "data": [
    {
      "id": "42",
      "title": "Reunión",
      "start": "2025-04-07T08:00:00Z",
      "end": "2025-04-07T09:00:00Z",
      "allDay": false,
      "type": "meeting",
      "color": "#22C55E",
      "description": null,
      "location": "Sala A",
      "recurrence": "none",
      "region": null
    }
  ]
}
```

Recurring events are expanded — each occurrence is a separate object with `id: "42_2025-04-07"`.

If `types` is omitted, all types are returned (including holidays). If `regions` is omitted and `types` includes `holiday`, holidays of `region = 'national'` are returned by default — UI must explicitly pass region params to control this.

### 9.2 POST /api/events

Body (JSON): `NewEvent` shape — all fields from §2.1 except `id`, `createdAt`, `updatedAt`.

Response `201`:
```json
{ "data": { ...createdEvent } }
```

Errors:
- `400` — missing required fields or `end < start`
- `400` — attempt to set `type: 'holiday'`

### 9.3 PATCH /api/events/:id

Body: partial `Event` — only fields to update.

Response `200`: `{ "data": { ...updatedEvent } }`

Errors:
- `403` — event is a holiday
- `404` — not found
- `400` — invalid field values

### 9.4 DELETE /api/events/:id

Response `200`: `{ "data": { "deleted": true } }`

Errors:
- `403` — event is a holiday
- `404` — not found

### 9.5 GET /api/summary

Query: `?date=YYYY-MM-DD`

Response `200`:
```json
{
  "data": {
    "date": "2025-04-07",
    "content": "Hoy tienes una reunión...",
    "generatedAt": "2025-04-07T06:00:00Z"
  }
}
```

Response `404`: `{ "error": "No summary for this date" }`

### 9.6 POST /api/summary

Body: `{ "date": "YYYY-MM-DD" }`

Response `200`: `{ "data": { ...summary } }`

Errors:
- `400` — missing or invalid date
- `503` — Claude subprocess failed

### 9.7 POST /api/telegram/webhook

Body: Telegram Update object.

Response `200` always (Telegram requires 200 even on processing errors — errors are handled internally).

---

## 10. Error Handling

### API Layer

```ts
export async function GET(req: NextRequest) {
  try {
    // ... logic
    return NextResponse.json({ data: result })
  } catch (e) {
    console.error('[api/events GET]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- Never expose stack traces or internal error details in API responses.
- Log full errors server-side with route prefix for grep-ability.

### Telegram Bot

- Any unhandled error in a handler → catch → send "Ha ocurrido un error. Por favor, intenta de nuevo." → log full error.
- Claude parsing failure → specific message: "No pude entender el evento."
- Whisper failure → specific message: "No pude transcribir el audio."
- Network failure fetching from Telegram → log + retry once.

### UI

- SWR error state → show inline error message near the affected area (not a full-page error).
- EventForm submit failure → inline error, keep form open with data intact.
- Summary regeneration failure → inline error in SummaryBanner.

---

## 11. Edge Cases and Constraints

| Scenario | Behavior |
|---|---|
| Event `end < start` | API returns 400; form prevents submission |
| Create event overlapping existing | Allowed — no conflict detection |
| Delete a recurring event | Deletes the base record; all expansions disappear |
| Edit a single occurrence of recurring event | Not supported (future feature) |
| Telegram pending edit expires (30 min) | Callback returns "Esta acción ha expirado. Por favor, intenta de nuevo." |
| Nager.Date API unreachable at startup | Log warning, continue without holidays; next request retries |
| Claude subprocess not found in PATH | API returns 503; bot sends error message |
| Whisper binary not found | Bot sends "El servicio de transcripción no está disponible." |
| Holiday seed runs for already-seeded year | Count check prevents duplicate insert |
| User attempts to create `type: holiday` via API | 400 |
| User attempts to delete `type: holiday` via API | 403 |
| Summary requested for a date with no events | Claude generates "No tienes eventos para hoy." style message |
| Timezone edge: event at 23:00 Madrid = next day UTC | Stored as UTC; display in Madrid tz handles correctly |
| `allDay` event time pickers | Hidden in UI; stored as `00:00:00Z` / `23:59:59Z` |
| Mini calendar month navigation vs. main calendar | Independent — mini calendar month nav does not affect main view |
| Multiple holiday regions active simultaneously | All active regions' holidays are fetched and displayed |

---

## 12. Backlog / Future Features

These are explicitly out of scope for initial implementation but mentioned in the briefing or implied by design decisions:

- **Edit single occurrence** of a recurring event (vs. edit all)
- **Delete single occurrence** of a recurring event
- **Drag-and-drop** to move events to different days/times
- **Resize events** by dragging their bottom edge in week/day view
- **Event search** — full-text search across title, description, location
- **Multi-year holiday seeding** — proactively seed next year's holidays in December
- **Export to iCal** — `.ics` file download
- **Import from iCal** — parse `.ics` uploads
- **Multiple calendars / categories** beyond the current type system
- **Shared access** — multiple users or read-only sharing via link
- **Push notifications** — browser notifications for upcoming events
- **Telegram groups** — currently single-user only
- **SMS/email fallback** if Telegram is unreachable
- **Event attachments** — file uploads linked to events
- **Google Calendar sync** — bidirectional CalDAV or API sync
