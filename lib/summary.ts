import { and, gte, lte } from 'drizzle-orm'
import { db } from './db'
import { events, summaries } from './db/schema'
import { generateDailySummary } from './claude'
import { bot } from './telegram/bot'

type SummaryEvent = {
  title: string
  start: string
  end: string
  type: string
  location: string | null
}

function toSummaryEvent(ev: typeof events.$inferSelect): SummaryEvent {
  return {
    title: ev.title,
    start: ev.start,
    end: ev.end,
    type: ev.type,
    location: ev.location,
  }
}

function madridWeekday(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(new Date(dateStr + 'T12:00:00Z'))
}

function addDaysMadrid(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// Offset in minutes of Europe/Madrid relative to UTC on the given Madrid date
// (positive = ahead of UTC). Uses noon UTC to stay away from DST transition edges.
function madridOffsetMinutes(date: string): number {
  const noonUtc = new Date(date + 'T12:00:00Z')
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(noonUtc)
      .find(p => p.type === 'hour')!.value,
    10,
  )
  return (hour - 12) * 60
}

// Convert a Madrid calendar day (YYYY-MM-DD) to its UTC [start, end] ISO range.
function madridDayRangeUtc(date: string): { start: string; end: string } {
  const offsetMin = madridOffsetMinutes(date)
  const dayStartMs = Date.parse(`${date}T00:00:00Z`) - offsetMin * 60_000
  const dayEndMs = dayStartMs + 24 * 60 * 60_000 - 1
  return {
    start: new Date(dayStartMs).toISOString(),
    end: new Date(dayEndMs).toISOString(),
  }
}

export async function generateAndStoreSummary(
  date: string,
  opts: { sendTelegram?: boolean } = {},
): Promise<string> {
  const { start, end } = madridDayRangeUtc(date)

  const dayEvents = await db
    .select()
    .from(events)
    .where(and(gte(events.start, start), lte(events.start, end)))

  const todaySummaryEvents = dayEvents.map(toSummaryEvent)

  let weekSummaryEvents: SummaryEvent[] | undefined
  if (madridWeekday(date) === 'Mon') {
    const tomorrow = addDaysMadrid(date, 1)
    const sunday = addDaysMadrid(date, 6)
    const tomorrowStart = madridDayRangeUtc(tomorrow).start
    const sundayEnd = madridDayRangeUtc(sunday).end
    const restOfWeek = await db
      .select()
      .from(events)
      .where(and(gte(events.start, tomorrowStart), lte(events.start, sundayEnd)))
    weekSummaryEvents = restOfWeek.map(toSummaryEvent)
  }

  const content = await generateDailySummary(date, todaySummaryEvents, weekSummaryEvents)

  await db
    .insert(summaries)
    .values({ date, content })
    .onConflictDoUpdate({
      target: summaries.date,
      set: { content, generatedAt: new Date().toISOString() },
    })

  if (opts.sendTelegram) {
    const chatId = process.env.TELEGRAM_AUTHORIZED_USER_ID
    if (bot && chatId) {
      try {
        await bot.api.sendMessage(Number(chatId), `📊 *Daily summary (${date}):*\n\n${content}`, {
          parse_mode: 'Markdown',
        })
      } catch (error) {
        console.error('[Summary] Telegram send failed:', error)
      }
    }
  }

  return content
}

export function getTodayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
