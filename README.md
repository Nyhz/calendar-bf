```
  ██████╗ █████╗ ██╗     ███████╗███╗   ██╗██████╗  █████╗ ██████╗
 ██╔════╝██╔══██╗██║     ██╔════╝████╗  ██║██╔══██╗██╔══██╗██╔══██╗
 ██║     ███████║██║     █████╗  ██╔██╗ ██║██║  ██║███████║██████╔╝
 ██║     ██╔══██║██║     ██╔══╝  ██║╚██╗██║██║  ██║██╔══██║██╔══██╗
 ╚██████╗██║  ██║███████╗███████╗██║ ╚████║██████╔╝██║  ██║██║  ██║
  ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
                       N Y H Z   C A L
```

![claude code](https://img.shields.io/badge/claude_code-required-blue?style=flat-square)
![node](https://img.shields.io/badge/node-20%2B-green?style=flat-square)
![next.js](https://img.shields.io/badge/next.js-16.2-white?style=flat-square)
![sqlite](https://img.shields.io/badge/sqlite-local-yellow?style=flat-square)
![telegram](https://img.shields.io/badge/telegram-bot-0088cc?style=flat-square)
![timezone](https://img.shields.io/badge/tz-Europe%2FMadrid-orange?style=flat-square)

**Personal Calendar — Web UI + Telegram Bot + AI Daily Briefings**

> *Un calendario personal. Una agenda en el bolsillo. Un resumen cada mañana.*

A single-user calendar that lives on your machine. Full-featured web UI in the style of Google Calendar, a Telegram bot that takes free-form text or voice messages and turns them into events, and a daily AI-generated briefing that lands on your phone at 08:00 Madrid time.

No cloud. No accounts. No subscription. Just a SQLite file, a bot token, and Claude Code doing the talking.

---

## Capabilities

### Calendar Web App

- **Four views** — Month (6×7 grid), Week (7-column time grid), Day (single-column time grid), Agenda (scrollable date-grouped list)
- **Google Calendar–grade UX** — Click-to-create, drag-to-reschedule, popover detail cards, inline edit/delete
- **Event types with color coding** — `event`, `meeting`, `birthday`, `reminder`, `holiday` (blue / green / purple / yellow / red)
- **Filters & toggles** — Show/hide by type, toggle regional holidays (National / Basque Country / Madrid)
- **Dark mode** — Class-based Tailwind toggle, persisted in `localStorage`
- **Mini-calendar sidebar** — Quick month navigation with a clickable date grid
- **Recurrence** — Daily, weekly, monthly, yearly. Single-row storage with on-the-fly expansion within the listed range
- **Daily summary banner** — The morning's AI briefing displayed at the top of the calendar

### Telegram Bot

- **Free-form text** — "mañana a las 10 dentista" → parsed event with title, type, and start/end times
- **Voice messages** — Local Whisper transcription (mlx-whisper or whisper.cpp) → Claude parsing → event
- **Edit flow** — Reply to any bot event confirmation to amend it; UUID callbacks track pending edits
- **Reminders** — Point-in-time notifications pushed 5 minutes before the event
- **Spanish-first** — UI copy and bot responses in Spanish, Madrid timezone throughout
- **Authorized access** — Only the configured Telegram user ID can reach the bot

### AI Daily Summaries

- **08:00 Madrid cron** — `node-cron` triggers a Claude Code subprocess each morning
- **Today at a glance** — Prose briefing of events, reminders, and holidays for the day
- **Telegram delivery** — Pushed to chat with the summary banner updating in the web UI
- **Regenerate on demand** — `POST /api/summary` to rebuild any date's briefing

### Spanish Holidays

- **Auto-seeded from Nager.Date** — First access of a new year fetches + stores holidays
- **Three scopes** — National, `ES-PV` (Basque Country), `ES-MD` (Madrid). Other regions are skipped
- **System-managed** — Holidays cannot be created or deleted via the events API (`403`)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  BROWSER (localhost:3000)                 │
│         Month · Week · Day · Agenda + Sidebar             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Next.js 16 App Router                                  │
│   ├── Server Components (initial render, DB queries)     │
│   ├── Client Components (SWR, forms, popovers)           │
│   └── Route Handlers — /api/events, /summary, /holidays  │
│                                                          │
├────────────┬─────────────────┬───────────────────────────┤
│  SQLite    │  grammy Bot     │   Subprocesses            │
│  Drizzle   │  webhook / poll │   ├── Claude Code CLI     │
│  local.db  │                 │   └── Whisper (local)     │
├────────────┴─────────────────┴───────────────────────────┤
│                                                          │
│   node-cron                                              │
│   └── 08:00 Madrid — daily summary generation + push     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                   External (read-only)                    │
│   └── Nager.Date API — Spanish holiday seed              │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 20+ | `execFile`, cron, SQLite bindings |
| Framework | Next.js 16 (App Router) | RSC, co-located API routes, file-based routing |
| Language | TypeScript (strict) | No `any` without a comment |
| Styling | Tailwind CSS 4 | Utility-first, class-based dark mode |
| Database | SQLite via `better-sqlite3` | Zero infrastructure, one file |
| ORM | Drizzle ORM 0.45 | Type-safe schema + generated migrations |
| Client State | SWR | Server-state cache for event lists |
| Telegram | grammy 1.42 | TypeScript-first, webhook + long-polling |
| Voice | mlx-whisper / whisper.cpp | Local transcription — no external API |
| AI | Claude Code CLI (`--print`) | Subprocess for parsing + summaries |
| Scheduling | node-cron 4 | In-process daily cron |
| Holidays | Nager.Date | Free, no key, Spanish-region aware |
| Testing | Vitest 4 | Smoke-test harness |

---

## Domain Model

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | autoincrement |
| `title` | text | required |
| `start` / `end` | text | ISO 8601 UTC — always stored as UTC |
| `allDay` | 0 \| 1 | SQLite has no boolean |
| `type` | text | `event` · `meeting` · `birthday` · `reminder` · `holiday` |
| `color` | text | hex — defaults from `TYPE_COLORS` |
| `description`, `location` | text | optional |
| `recurrence` | text | `none` · `daily` · `weekly` · `monthly` · `yearly` |
| `region` | text | `null` (user event) · `national` · `ES-PV` · `ES-MD` |
| `createdAt`, `updatedAt` | text | `datetime('now')` defaults |

### `summaries`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `date` | text UNIQUE | `YYYY-MM-DD` in Madrid tz |
| `content` | text | prose, may contain markdown |
| `generatedAt` | text | `datetime('now')` |

### Type Colors

```ts
event    #3B82F6   blue-500
meeting  #22C55E   green-500
birthday #A855F7   purple-500
reminder #EAB308   yellow-500
holiday  #EF4444   red-500
```

---

## API Reference

All responses: `{ data: T }` on success, `{ error: string }` on failure.

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | List events. Query: `start`, `end` (ISO), `types` (csv), `regions` (csv) |
| `POST` | `/api/events` | Create event. Body: `NewEvent`. Returns `201` |
| `GET` | `/api/events/:id` | Single event |
| `PATCH` | `/api/events/:id` | Partial update |
| `DELETE` | `/api/events/:id` | Delete. `403` if `type === 'holiday'` |

### Holidays

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/holidays?year=YYYY` | List holidays for the year. Seeds from Nager.Date if missing |

### Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/summary?date=YYYY-MM-DD` | Fetch summary. `404` if not yet generated |
| `POST` | `/api/summary` | Regenerate for `{ date }`. `503` if Claude subprocess fails |

### Telegram

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/telegram/webhook` | Telegram update receiver (production only) |

### Status Codes

`200` ok · `201` created · `400` bad input · `403` forbidden · `404` not found · `500` server error · `503` upstream dependency failed.

---

## Project Structure

```
calendar/
├── app/
│   ├── layout.tsx              # Root layout — dark mode class, font, globals
│   ├── page.tsx                # CalendarShell entry
│   ├── globals.css             # Tailwind base + CSS vars
│   └── api/
│       ├── events/
│       │   ├── route.ts        # GET · POST
│       │   └── [id]/route.ts   # GET · PATCH · DELETE
│       ├── holidays/route.ts
│       ├── summary/route.ts
│       └── telegram/webhook/route.ts
├── components/
│   ├── calendar/
│   │   ├── CalendarShell.tsx   # View router + header + layout
│   │   ├── MonthView.tsx       # 6×7 grid
│   │   ├── WeekView.tsx        # 7-column time grid
│   │   ├── DayView.tsx         # Single-column time grid
│   │   ├── AgendaView.tsx      # Scrollable date-grouped list
│   │   ├── EventPopover.tsx    # View / edit / delete popover
│   │   ├── EventForm.tsx       # Create / edit form
│   │   ├── MiniCalendar.tsx    # Sidebar month navigator
│   │   ├── Sidebar.tsx         # Mini cal + filters + region toggles
│   │   └── SummaryBanner.tsx   # Daily briefing card
│   └── ui/                     # Button, Modal, Toggle…
├── lib/
│   ├── db/
│   │   ├── schema.ts           # Drizzle tables
│   │   ├── index.ts            # DB client singleton
│   │   └── migrations/         # Generated SQL
│   ├── holidays.ts             # Nager.Date seed
│   ├── claude.ts               # Claude Code subprocess wrapper
│   ├── whisper.ts              # Whisper transcription wrapper
│   ├── telegram/
│   │   ├── bot.ts              # grammy bot + startup
│   │   └── handlers.ts         # Messages · commands · callbacks
│   └── cron.ts                 # node-cron jobs
├── scripts/                    # Dev helpers (calendar server cleanup)
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.local                  # gitignored
└── .env.local.example          # committed template
```

---

## Setup

### Prerequisites

- **Node.js 20+** and **npm**
- **Claude Code CLI** installed and authenticated ([docs](https://docs.anthropic.com/en/docs/claude-code))
- **Whisper binary** in `PATH` if you want voice messages — `mlx-whisper` (Apple Silicon) or `whisper.cpp`
- **A Telegram bot token** from [@BotFather](https://t.me/BotFather) and your numeric user ID

### Install

```bash
git clone <this-repo>
cd calendar
npm install
```

### Configure

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Required
TELEGRAM_BOT_TOKEN=              # From BotFather
TELEGRAM_AUTHORIZED_USER_ID=     # Your numeric Telegram user ID
CLAUDE_CODE_OAUTH_TOKEN=         # From `claude setup-token` (valid ~1 year)

# Required in production
TELEGRAM_WEBHOOK_URL=            # HTTPS URL → /api/telegram/webhook

# Optional (defaults shown)
WHISPER_MODEL=base               # tiny | base | small | medium | large
WHISPER_BACKEND=mlx-whisper      # mlx-whisper | whisper.cpp
DAILY_SUMMARY_CRON=0 8 * * *     # node-cron, Madrid time
NEXT_PUBLIC_TIMEZONE=Europe/Madrid
DATABASE_URL=./local.db
NODE_ENV=development
```

### Database

```bash
npm run db:generate    # Schema → SQL migration (only after schema changes)
npm run db:migrate     # Apply pending migrations — creates local.db on first run
```

### Launch

```bash
# Development — Next.js dev server + Telegram long-polling
npm run dev

# Production — Webhook mode
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000). Message your bot. Wait for 08:00.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Next.js dev server + Telegram long-polling |
| `npm run dev:clean` | Wipe `.next` then `dev` |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run typecheck` | `tsc --noEmit` — type errors only |
| `npm run lint` | ESLint |
| `npm test` | Vitest smoke-test suite |
| `npm run db:generate` | Drizzle → SQL migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio visual browser |

---

## Design Rules

### Timezone

**All datetimes stored as UTC ISO 8601 strings.** Display conversion happens at the component level with `Intl.DateTimeFormat` and `timeZone: 'Europe/Madrid'`. `NEXT_PUBLIC_TIMEZONE` is the single source of truth. All-day events use `T00:00:00Z` / `T23:59:59Z` but render date-only. Never `toLocaleDateString()` in server code.

### Recurrence

Recurring events are stored as a **single row**. Expansion into per-date occurrences happens in the API layer when listing within a date range — never stored individually. Expanded instances use a synthetic composite id: `${id}_${isoDate}`. `PATCH` always modifies the base record (all occurrences). Edit-single-occurrence is a future feature.

### Dark Mode

Class-based Tailwind (`darkMode: 'class'`). Toggle adds/removes `dark` on `<html>`. Preference persisted in `localStorage`. Every new UI must work in both.

### Single-User

The web UI has **no auth**. The Telegram bot checks `TELEGRAM_AUTHORIZED_USER_ID` on every update. That's the whole security model. Do not expose this to the internet without a tunnel or VPN.

### Holidays Are System-Managed

Seeded from Nager.Date on first access of a new year. `count(*) WHERE type='holiday' AND start LIKE 'YYYY-%'` — re-seeding within the same year is a no-op. The events API returns `403` for any create/delete where `type === 'holiday'`.

---

## Definition of Done

Before marking any task complete:

- [ ] `npm run typecheck` passes with zero errors
- [ ] No `console.error` during the happy path
- [ ] API endpoints validate input and return correct HTTP status codes
- [ ] All new UI works in both light and dark mode
- [ ] All datetime logic respects Europe/Madrid — no UTC leakage in display
- [ ] Any new DB columns have a corresponding generated migration
- [ ] New environment variables are added to `.env.local.example`
- [ ] Holidays cannot be created or deleted via the events API (`403`)

---

## Implementation Notes

- **SQLite file** (`local.db`) is gitignored. Created automatically on first `db:migrate`
- **Telegram edit state** is in-memory only — pending edits are lost on server restart
- **Claude subprocess failures** are soft errors — logged, surfaced to the user via Telegram, never crash the bot
- **Whisper failures** likewise — transcription is best-effort
- **Webhook vs polling** — `NODE_ENV=production` sets webhook once at startup; dev uses long-polling
- **Nager.Date** — only `national`, `ES-PV`, and `ES-MD` are imported; all other regions are skipped
- **Composite recurrence ids** — stable within a range query; don't persist them anywhere

---

## Philosophy

**One user. One machine. One source of truth.** This is not a SaaS calendar. It runs on your laptop, stores events in a file, and answers to exactly one person — you. No collaboration, no sharing, no accounts.

**AI where it saves time, nowhere else.** Claude parses your "mañana a las 10 dentista" into structured data. Claude writes the morning briefing. Claude does not predict what you want, nag you, or autosuggest. The calendar is yours; the AI is a keyboard shortcut.

**Local-first, boring infrastructure.** SQLite file. In-process cron. Subprocess CLI. grammy bot. No Redis, no queues, no Kubernetes. If it can't survive a laptop reboot, it doesn't belong here.

**Spanish by default.** Madrid timezone, Spanish UI copy, Spanish bot replies, Spanish holidays. The calendar speaks your language.

---

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

---

<p align="center">
  <sub>NYHZ CAL — v0.1.0</sub><br>
  <sub>Europe/Madrid · Local-first · One user, one calendar.</sub>
</p>
