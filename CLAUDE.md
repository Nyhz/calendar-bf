# CLAUDE.md — Calendar App

Authoritative reference for agents and developers working on this project.
Generated from Commander's briefing. Repository is pre-implementation.

---

## Project Overview

Personal calendar application with a Google Calendar–grade UI, a Telegram bot
interface for natural-language event creation (text + voice), AI-generated
daily summaries, and automatic Spanish holiday seeding. Primary user is a
single authorized individual, timezone Europe/Madrid.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | File-based routing, React Server Components, API routes co-located |
| Styling | Tailwind CSS | Utility-first, dark mode via `dark:` variant |
| Database | SQLite + Drizzle ORM | Zero-infrastructure local persistence; Drizzle for type-safe schema + migrations |
| Bot | grammy (Telegram) | Modern, TypeScript-first Telegram Bot API client |
| Voice transcription | Whisper (mlx-whisper or whisper.cpp) | Local — no external API, no cost, no data leaving device |
| AI parsing & summaries | Claude Code via `--system-prompt` | Spawned as child process; structured event parsing + natural-language summaries |
| Scheduling | node-cron | In-process cron for daily summary job |
| Holiday data | Nager.Date API (free, no key) | `GET https://date.nager.at/api/v3/PublicHolidays/{year}/ES` |

---

## Project Structure

> Repository is empty at bootstrap time. Build to this layout.

```
calendar/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (font, dark mode, providers)
│   ├── page.tsx                  # Calendar shell (redirects or renders month view)
│   ├── globals.css               # Tailwind base + custom CSS vars
│   ├── api/
│   │   ├── events/
│   │   │   ├── route.ts          # GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       └── route.ts      # GET, PATCH, DELETE
│   │   ├── holidays/
│   │   │   └── route.ts          # GET holidays; triggers seed if missing
│   │   ├── summary/
│   │   │   └── route.ts          # GET current summary, POST regenerate
│   │   └── telegram/
│   │       └── webhook/
│   │           └── route.ts      # Telegram webhook receiver
│   └── (calendar)/               # Route group for calendar views
│       └── page.tsx
├── components/
│   ├── calendar/
│   │   ├── CalendarShell.tsx     # Layout: sidebar + main view switcher
│   │   ├── MonthView.tsx
│   │   ├── WeekView.tsx
│   │   ├── DayView.tsx
│   │   ├── AgendaView.tsx
│   │   ├── EventPopover.tsx      # Click-on-event popover
│   │   ├── EventForm.tsx         # Create/edit modal
│   │   ├── MiniCalendar.tsx      # Sidebar date navigator
│   │   ├── Sidebar.tsx           # Mini calendar + type filters + holiday toggles
│   │   └── SummaryBanner.tsx     # Daily AI summary card
│   └── ui/                       # Generic primitives (Button, Modal, Toggle, etc.)
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   ├── index.ts              # DB connection singleton
│   │   └── migrations/           # Drizzle-generated migration files
│   ├── holidays.ts               # Nager.Date fetch + seed logic
│   ├── claude.ts                 # Spawn Claude Code child process helpers
│   ├── whisper.ts                # Invoke Whisper for voice transcription
│   ├── telegram/
│   │   ├── bot.ts                # grammy bot instance + middleware
│   │   └── handlers.ts           # Message, command, callback_query handlers
│   └── cron.ts                   # node-cron job definitions
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.local                    # Never committed
```

---

## Domain Model

### Entities

#### `events`

```ts
id          integer   PRIMARY KEY AUTOINCREMENT
title       text      NOT NULL
start       text      NOT NULL  -- ISO 8601 datetime, stored in UTC
end         text      NOT NULL  -- ISO 8601 datetime, stored in UTC
all_day     integer   NOT NULL  DEFAULT 0  -- boolean (0/1)
type        text      NOT NULL  DEFAULT 'event'
            -- CHECK type IN ('event','meeting','birthday','reminder','holiday')
color       text      NOT NULL  -- hex or Tailwind color name
description text
location    text
recurrence  text      DEFAULT 'none'
            -- CHECK recurrence IN ('none','daily','weekly','monthly','yearly')
region      text      -- NULL for user events; 'national'|'ES-PV'|'ES-MD' for holidays
created_at  text      NOT NULL  DEFAULT (datetime('now'))
updated_at  text      NOT NULL  DEFAULT (datetime('now'))
```

#### `summaries`

```ts
id          integer   PRIMARY KEY AUTOINCREMENT
date        text      NOT NULL UNIQUE  -- YYYY-MM-DD (Europe/Madrid date)
content     text      NOT NULL         -- generated markdown/prose
generated_at text     NOT NULL DEFAULT (datetime('now'))
```

### Relationships

- All holidays are stored in `events` with `type = 'holiday'` and a non-null `region`.
- User-created events have `region = NULL`.
- Summaries are keyed by Madrid-timezone date; one per day.

### Default Colors by Type

```ts
const TYPE_COLORS = {
  event:    '#3B82F6', // blue-500
  meeting:  '#22C55E', // green-500
  birthday: '#A855F7', // purple-500
  reminder: '#EAB308', // yellow-500
  holiday:  '#EF4444', // red-500
}
```

---

## Coding Rules and Conventions

### TypeScript
- Strict mode enabled. No `any` without a comment explaining why.
- Prefer `type` over `interface` for data shapes; `interface` for extension points.
- Infer Drizzle types from schema: `type Event = typeof events.$inferSelect`.

### File Conventions
- One component per file. Filename matches export name (PascalCase).
- `lib/` files export plain functions — no classes unless the abstraction demands it.
- API routes follow Next.js App Router conventions: named exports `GET`, `POST`, `PATCH`, `DELETE`.

### Data & Dates
- All datetimes stored as UTC ISO 8601 strings in SQLite.
- All display conversions happen at the component level using `Intl.DateTimeFormat` with `timeZone: 'Europe/Madrid'`.
- Never store local time strings in the DB.

### Styling
- Tailwind utility classes only. No custom CSS unless absolutely necessary (e.g., drag-resize handles).
- Dark mode: `dark:` prefix via `class` strategy (`darkMode: 'class'` in tailwind config).
- Color palette: extend Tailwind, don't override defaults.

### State Management
- Server state: SWR or React Query for calendar data fetching (choose one, stick with it).
- UI state: `useState` / `useReducer` in components. No global state library unless complexity demands it.
- Dark mode: stored in `localStorage`, toggled via class on `<html>`.

### API Design
- JSON in, JSON out. Always return `{ data }` or `{ error: string }`.
- HTTP status codes are meaningful: 200, 201, 400, 401, 404, 500.
- Validation at the API boundary — validate request body shape before hitting DB.

### Error Handling
- API routes: `try/catch`, return `{ error: message }` with appropriate status.
- Bot handlers: catch errors, send user-friendly Telegram message, log full error to console.
- Claude/Whisper subprocess failures: treat as soft errors — log, notify user via Telegram if in bot context.

### Environment Variables
- All secrets in `.env.local`. Never hardcode.
- Access via `process.env.VAR_NAME` — validate required vars at startup in `lib/env.ts`.

---

## Key Patterns

### Claude Code Subprocess

Invoke Claude Code for AI tasks (event parsing, summary generation):

```ts
// lib/claude.ts
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function runClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const { stdout } = await execFileAsync('claude', [
    '--system-prompt', systemPrompt,
    '--print',                // non-interactive output
    userMessage,
  ])
  return stdout.trim()
}
```

### Holiday Seed Check

On app startup (or first request to `/api/holidays`), check if holidays for the
current year exist. If not, fetch and seed:

```ts
const count = await db.select({ count: sql`count(*)` })
  .from(events)
  .where(and(eq(events.type, 'holiday'), like(events.start, `${year}%`)))

if (count[0].count === 0) {
  await seedHolidays(year)
}
```

### Telegram Webhook vs Polling

Use webhook in production, polling in development:

```ts
if (process.env.NODE_ENV === 'production') {
  bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL!)
} else {
  bot.start()  // long-polling
}
```

### Recurrence Expansion

Recurring events are stored as a single row with a `recurrence` field.
Expand occurrences at query time in the API layer — do not store individual
occurrences. Return expanded events with a synthetic `id` like `${id}_${date}`.

---

## Definition of Done Checklist

Before marking any task complete, verify:

- [ ] TypeScript compiles with no errors (`tsc --noEmit`)
- [ ] No `console.error` output during the happy path
- [ ] API route validates input and returns correct status codes
- [ ] Dark mode works for all new UI elements
- [ ] Europe/Madrid timezone is respected (no UTC leakage in display)
- [ ] New DB columns have migrations (not manual schema edits)
- [ ] `.env.local` variables are documented in this file under Environment Variables

---

## Environment Variables

Document all required variables here. Store in `.env.local` (never committed).

```bash
# Telegram
TELEGRAM_BOT_TOKEN=         # BotFather token
TELEGRAM_AUTHORIZED_USER_ID= # Numeric Telegram user ID
TELEGRAM_WEBHOOK_URL=       # HTTPS URL for webhook (production only)

# Claude Code
# No token needed — uses the Claude Code CLI authenticated via `claude auth`

# Whisper
WHISPER_MODEL=base           # Model size: tiny, base, small, medium, large
WHISPER_BACKEND=mlx-whisper  # 'mlx-whisper' (Apple Silicon) or 'whisper.cpp'

# Cron
DAILY_SUMMARY_CRON=0 8 * * * # Default: 8:00 AM Madrid time

# App
NEXT_PUBLIC_TIMEZONE=Europe/Madrid
DATABASE_URL=./local.db      # SQLite file path
```

---

## Scripts / Commands Reference

```bash
# Development
npm run dev           # Next.js dev server + bot long-polling

# Database
npm run db:generate   # drizzle-kit generate — create migration from schema changes
npm run db:migrate    # drizzle-kit migrate — apply pending migrations
npm run db:studio     # drizzle-kit studio — visual DB browser

# Type checking
npm run typecheck     # tsc --noEmit

# Build
npm run build         # Next.js production build
npm start             # Production server
```

---

## Notes for Agents

- This is a single-user app. No auth layer beyond Telegram user ID check.
- Whisper runs locally — ensure the binary/model is available at runtime. Document setup steps in README when writing onboarding docs.
- Claude Code CLI must be authenticated on the host machine (`claude auth login`).
- SQLite file (`local.db`) is gitignored.
- The Nager.Date holiday API is free and requires no API key.
- Holiday regions to support: `national`, `ES-PV` (Basque Country), `ES-MD` (Madrid). No others.
