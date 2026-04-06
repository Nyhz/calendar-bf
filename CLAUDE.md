# CLAUDE.md — Authoritative Reference

> Single-user personal calendar. Next.js app + Telegram bot + AI daily briefings.
> Timezone: Europe/Madrid throughout. All infrastructure is local — no cloud required.

---

## Project Overview

A personal calendar web app with a companion Telegram bot. Core capabilities:

- Full-featured calendar UI (month/week/day/agenda views) matching Google Calendar UX
- Telegram bot: create events via free-form text or voice (Whisper transcription → Claude parsing)
- AI-generated daily summaries via Claude Code subprocess, sent to Telegram + shown in UI
- Spanish public holidays (national + Basque Country + Madrid) seeded from Nager.Date API
- Single-user — authorization enforced by Telegram user ID, no auth system in the web app

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 20 (install via latest) (App Router) | RSC, co-located API routes, file-based routing |
| Styling | Tailwind CSS v4 | Utility-first, dark mode via `class` strategy |
| Database | SQLite + Drizzle ORM | Zero infrastructure, type-safe schema + migrations |
| Telegram Bot | grammy | TypeScript-first, webhook + long-polling support |
| Voice | mlx-whisper or whisper.cpp | Local, no external API |
| AI | Claude Code CLI (`--print --system-prompt`) | Subprocess for parsing & summaries |
| Scheduling | node-cron | In-process cron for daily summary |
| Holidays | Nager.Date API | Free, no key, Spanish holidays |

IMPORTANT: Use latest versions of each dependency, don't install arbitrary versions
---

## Project Structure

```
calendar/
├── app/
│   ├── layout.tsx               # Root layout: dark mode class, font, globals
│   ├── page.tsx                 # Redirects to /calendar or renders CalendarShell
│   ├── globals.css              # Tailwind base + custom CSS vars
│   └── api/
│       ├── events/
│       │   ├── route.ts         # GET (list), POST (create)
│       │   └── [id]/route.ts    # GET, PATCH, DELETE
│       ├── holidays/route.ts    # GET — triggers seed if needed
│       ├── summary/route.ts     # GET (fetch), POST (regenerate)
│       └── telegram/
│           └── webhook/route.ts # POST — Telegram update receiver
├── components/
│   ├── calendar/
│   │   ├── CalendarShell.tsx    # View router, header, layout
│   │   ├── MonthView.tsx        # 6×7 grid
│   │   ├── WeekView.tsx         # 7-column time grid
│   │   ├── DayView.tsx          # Single-column time grid
│   │   ├── AgendaView.tsx       # Scrollable date-grouped list
│   │   ├── EventPopover.tsx     # Event detail popover (view/edit/delete)
│   │   ├── EventForm.tsx        # Create/edit form (full fields)
│   │   ├── MiniCalendar.tsx     # Sidebar mini-month navigator
│   │   ├── Sidebar.tsx          # Mini calendar + filters + holiday toggles
│   │   └── SummaryBanner.tsx    # Daily AI summary card
│   └── ui/                      # Primitive components (Button, Modal, Toggle…)
├── lib/
│   ├── db/
│   │   ├── schema.ts            # Drizzle table definitions
│   │   ├── index.ts             # DB client singleton
│   │   └── migrations/          # Generated SQL migrations
│   ├── holidays.ts              # Nager.Date fetch + seed logic
│   ├── claude.ts                # Claude Code subprocess wrapper
│   ├── whisper.ts               # Whisper transcription wrapper
│   ├── telegram/
│   │   ├── bot.ts               # grammy bot instance + startup
│   │   └── handlers.ts          # Message/command/callback handlers
│   └── cron.ts                  # node-cron job definitions
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.local                   # gitignored
└── .env.local.example           # committed template
```

---

## Domain Model

### `events` table

```ts
// lib/db/schema.ts
export const events = sqliteTable('events', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  start:       text('start').notNull(),       // ISO 8601 UTC: "2025-06-15T08:00:00Z"
  end:         text('end').notNull(),         // ISO 8601 UTC
  allDay:      integer('all_day').notNull().default(0),  // 0|1 (SQLite has no boolean)
  type:        text('type').notNull().default('event'),  // event|meeting|birthday|reminder|holiday
  color:       text('color').notNull(),       // hex string e.g. "#3B82F6"
  description: text('description'),
  location:    text('location'),
  recurrence:  text('recurrence').default('none'),  // none|daily|weekly|monthly|yearly
  region:      text('region'),               // null (user event) | national | ES-PV | ES-MD
  createdAt:   text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt:   text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
```

### `summaries` table

```ts
export const summaries = sqliteTable('summaries', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  date:        text('date').notNull().unique(),  // YYYY-MM-DD (Madrid tz)
  content:     text('content').notNull(),        // prose, possibly markdown
  generatedAt: text('generated_at').notNull().default(sql`(datetime('now'))`),
})
```

### Default colors by type

```ts
export const TYPE_COLORS: Record<string, string> = {
  event:    '#3B82F6',  // blue-500
  meeting:  '#22C55E',  // green-500
  birthday: '#A855F7',  // purple-500
  reminder: '#EAB308',  // yellow-500
  holiday:  '#EF4444',  // red-500
}
```

---

## Coding Rules and Conventions

### TypeScript

- Strict mode (`"strict": true`). No `any` without a comment explaining why.
- Prefer `type` over `interface` for data shapes. Use `interface` only for extension patterns.
- Infer Drizzle types from schema: `type Event = typeof events.$inferSelect` — never duplicate.
- API route handlers typed with `NextRequest` / `NextResponse`.

### File conventions

- One component per file, PascalCase filename matches export name.
- `lib/` exports plain async functions, no React.
- API routes: named exports `GET`, `POST`, `PATCH`, `DELETE` — no default export.
- Keep components in `components/calendar/`; generic UI primitives in `components/ui/`.

### Date and timezone

- **All datetimes stored as UTC ISO 8601 strings** in the DB (`"2025-06-15T08:00:00Z"`).
- Display conversions happen at the component level using `Intl.DateTimeFormat` with `timeZone: 'Europe/Madrid'`.
- All-day events use `T00:00:00Z` / `T23:59:59Z` as start/end but render date-only.
- Never store local time strings. Never use `new Date().toLocaleDateString()` in server code.
- `NEXT_PUBLIC_TIMEZONE=Europe/Madrid` is the single source of truth.

### Styling

- Tailwind utility classes only — no `<style>` blocks, no CSS modules.
- Dark mode: `darkMode: 'class'` in `tailwind.config.ts`. Toggle adds/removes `dark` class on `<html>`.
- Persist dark mode preference in `localStorage`.
- Calendar type colors come from `TYPE_COLORS` — never hardcode in JSX.

### State management

- Server state (events, summary): SWR with key pattern `['/api/events', { start, end, types }]`.
- Filter/view UI state: `useState` in `CalendarShell`.
- Dark mode + filter preferences: `localStorage`.
- No global state library (Zustand, Redux) — not needed.

### API design

- All responses: `{ data: T }` on success, `{ error: string }` on failure.
- HTTP status codes: 200 (ok), 201 (created), 400 (bad input), 403 (forbidden), 404 (not found), 500 (server error), 503 (upstream dependency failed).
- Validate at the API boundary (shape, required fields) before touching the DB.
- `DELETE /api/events/:id` returns 403 if `type === 'holiday'` — holidays are system-managed.

### Error handling

- API routes: `try/catch` around all async, return `{ error: e.message }` with appropriate status.
- Telegram handlers: catch all errors, send a user-friendly message (in Spanish), log full error server-side.
- Claude/Whisper subprocess failures: soft error — log, notify user via Telegram, don't crash the bot.
- Never swallow errors silently.

---

## Key Patterns

### Claude subprocess

```ts
// lib/claude.ts
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function runClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const { stdout } = await execFileAsync('claude', [
    '--system-prompt', systemPrompt,
    '--print',
    userMessage,
  ])
  return stdout.trim()
}
```

Claude must be authenticated on the host (`claude auth login`). No API key env var needed.

### Holiday seed (startup check)

```ts
// Called from lib/holidays.ts, triggered on app init or GET /api/holidays
async function ensureHolidaysSeeded(year: number) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.type, 'holiday'), like(events.start, `${year}-%`)))

  if (count === 0) await seedHolidaysFromAPI(year)
}
```

### Recurrence expansion

Recurring events are stored as a **single row**. Expansion to multiple occurrences happens in the API layer when listing events within a date range — not stored individually. Expanded instances get a synthetic composite id: `"${id}_${isoDate}"`.

### Telegram webhook vs. polling

```ts
// lib/telegram/bot.ts
if (process.env.NODE_ENV === 'production') {
  // Webhook: set once at startup, handled by /api/telegram/webhook
  await bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL!)
} else {
  bot.start()  // long-polling for local dev
}
```

### Filter state

Filter state (event type checkboxes + holiday region toggles) lives in `CalendarShell` and is passed down to view components. Persistence to `localStorage` happens in a `useEffect`. Default state:

```ts
const DEFAULT_FILTERS = {
  types: ['event', 'meeting', 'birthday', 'reminder', 'holiday'],
  regions: ['national'],  // ES-PV and ES-MD off by default
}
```

---

## API Endpoints Reference

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | List events. Query: `start`, `end` (ISO), `types` (csv), `regions` (csv) |
| `POST` | `/api/events` | Create event. Body: `NewEvent` shape. Returns 201 + created event. |
| `GET` | `/api/events/:id` | Single event by id. |
| `PATCH` | `/api/events/:id` | Partial update. Returns updated event. |
| `DELETE` | `/api/events/:id` | Delete. Returns 403 if `type === 'holiday'`. |

### Holidays

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/holidays` | List holidays for `?year=YYYY`. Seeds if not present. |

### Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/summary` | Fetch summary for `?date=YYYY-MM-DD`. 404 if none yet. |
| `POST` | `/api/summary` | Regenerate for `{ date }`. 503 if Claude fails. |

### Telegram

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/telegram/webhook` | Telegram update receiver (production only). |

---

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=               # From BotFather
TELEGRAM_AUTHORIZED_USER_ID=      # Numeric Telegram user ID (string)

# Required in production
TELEGRAM_WEBHOOK_URL=             # Full HTTPS URL to /api/telegram/webhook

# Optional (defaults shown)
WHISPER_MODEL=base                # tiny | base | small | medium | large
WHISPER_BACKEND=mlx-whisper       # mlx-whisper | whisper.cpp
DAILY_SUMMARY_CRON=0 8 * * *      # node-cron expression, Madrid time
NEXT_PUBLIC_TIMEZONE=Europe/Madrid
DATABASE_URL=./local.db           # SQLite file path
NODE_ENV=development              # development | production
```

Claude Code CLI: no env var — must be pre-authenticated via `claude auth login` on the host.

---

## Scripts Reference

```bash
npm run dev             # Next.js dev server + Telegram long-polling
npm run build           # Production build
npm start               # Production server

npm run db:generate     # drizzle-kit generate — schema → SQL migration
npm run db:migrate      # drizzle-kit migrate — apply pending migrations
npm run db:studio       # drizzle-kit studio — visual DB browser

npm run typecheck       # tsc --noEmit — no build output, just type errors
```

---

## Definition of Done

Before marking any task complete:

- [ ] `npm run typecheck` passes with zero errors
- [ ] No `console.error` during the happy path
- [ ] API endpoints validate input and return correct HTTP status codes
- [ ] All new UI works in both light and dark mode
- [ ] All datetime logic respects `Europe/Madrid` — no UTC leakage in display
- [ ] Any new DB columns have a corresponding generated migration
- [ ] New environment variables are added to `.env.local.example`
- [ ] Holidays cannot be created or deleted via the events API (403)

---

## Implementation Notes

- **Single-user**: The web UI has no auth. Security is Telegram user ID check only.
- **Whisper binary**: Must be installed and accessible in `PATH` at runtime before voice messages work.
- **SQLite file** (`local.db`): gitignored. Created automatically on first `db:migrate`.
- **Recurrence editing**: PATCH always modifies the base record (all future occurrences). Edit-single-occurrence is a future feature.
- **Telegram edit flow**: Pending edit state is in-memory only — lost on server restart.
- **Holiday deduplication**: Seed checks `count(*) WHERE type='holiday' AND start LIKE 'YYYY-%'`. Re-seeding within the same year is a no-op.
- **Nager.Date regions**: Only `national`, `ES-PV`, and `ES-MD` are stored. All other regional holidays are skipped on import.
