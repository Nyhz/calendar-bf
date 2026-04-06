import cron from 'node-cron'
import { db } from './db'
import { events, summaries } from './db/schema'
import { generateDailySummary } from './claude'
import { bot } from './telegram/bot'
import { and, gte, lte } from 'drizzle-orm'

function getTodayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function startCronJobs(): void {
  const cronExpression = process.env.DAILY_SUMMARY_CRON || '0 8 * * *'

  cron.schedule(cronExpression, async () => {
    console.log('[Cron] Daily summary job started')

    try {
      const dateStr = getTodayMadrid()
      const start = `${dateStr}T00:00:00Z`
      const end = `${dateStr}T23:59:59Z`

      const todayEvents = await db
        .select()
        .from(events)
        .where(and(gte(events.start, start), lte(events.start, end)))

      const summaryEvents = todayEvents.map((ev) => ({
        title: ev.title,
        start: ev.start,
        end: ev.end,
        type: ev.type,
        location: ev.location,
      }))

      const content = await generateDailySummary(dateStr, summaryEvents)

      await db
        .insert(summaries)
        .values({ date: dateStr, content })
        .onConflictDoUpdate({
          target: summaries.date,
          set: { content, generatedAt: new Date().toISOString() },
        })

      console.log(`[Cron] Daily summary saved for ${dateStr}`)

      const chatId = process.env.TELEGRAM_AUTHORIZED_USER_ID
      if (bot && chatId) {
        await bot.api.sendMessage(Number(chatId), `📊 *Daily summary (${dateStr}):*\n\n${content}`, {
          parse_mode: 'Markdown',
        })
        console.log('[Cron] Summary sent to Telegram')
      }
    } catch (error) {
      console.error('[Cron] Daily summary job failed:', error)
    }
  })

  console.log(`[Cron] Daily summary scheduled: ${process.env.DAILY_SUMMARY_CRON || '0 8 * * *'}`)
}
