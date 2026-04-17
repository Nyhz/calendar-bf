import cron, { type ScheduledTask } from 'node-cron'
import { db } from './db'
import { events, summaries } from './db/schema'
import { bot } from './telegram/bot'
import { and, eq, gte, lte } from 'drizzle-orm'
import { getSetting } from './settings'
import { syncGoogleCalendars } from './google/sync'
import { generateAndStoreSummary, getTodayMadrid } from './summary'

async function runDailySummary(): Promise<void> {
  console.log('[Cron] Daily summary job started')
  try {
    const dateStr = getTodayMadrid()
    await generateAndStoreSummary(dateStr, { sendTelegram: true })
    console.log(`[Cron] Daily summary saved & sent for ${dateStr}`)
  } catch (error) {
    console.error('[Cron] Daily summary job failed:', error)
  }
}

async function catchUpTodaysSummary(): Promise<void> {
  try {
    const dateStr = getTodayMadrid()
    const [existing] = await db
      .select({ id: summaries.id })
      .from(summaries)
      .where(eq(summaries.date, dateStr))

    if (existing) {
      console.log(`[Cron] Catch-up skipped — summary already exists for ${dateStr}`)
      return
    }

    console.log(`[Cron] Catch-up running — no summary found for ${dateStr}`)
    await generateAndStoreSummary(dateStr, { sendTelegram: true })
    console.log(`[Cron] Catch-up summary saved & sent for ${dateStr}`)
  } catch (error) {
    console.error('[Cron] Catch-up summary failed:', error)
  }
}

// Holds the currently running summary task so it can be stopped and rescheduled
let summaryTask: ScheduledTask | null = null

/**
 * Parse a "HH:MM" time string and return a cron expression "M H * * *".
 * Returns null if the string is not a valid time.
 */
function timeToCron(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${m} ${h} * * *`
}

export async function scheduleSummary(): Promise<void> {
  // Stop the previously running task, if any
  if (summaryTask) {
    summaryTask.stop()
    summaryTask = null
  }

  // Derive cron expression: DB setting → env var → hardcoded default
  const storedTime = await getSetting('daily_summary_time', '')
  let cronExpression = timeToCron(storedTime) ?? process.env.DAILY_SUMMARY_CRON ?? '0 8 * * *'

  // Validate the final expression; fall back to default if invalid
  if (!cron.validate(cronExpression)) {
    console.warn(`[Cron] Invalid summary cron expression "${cronExpression}", falling back to "0 8 * * *"`)
    cronExpression = '0 8 * * *'
  }

  summaryTask = cron.schedule(cronExpression, runDailySummary, {
    timezone: 'Europe/Madrid',
  })

  console.log(`[Cron] Daily summary scheduled: ${cronExpression}`)
}

export function startCronJobs(): void {
  // Daily summary — scheduled immediately (async; errors are non-fatal at startup)
  scheduleSummary()
    .then(() => catchUpTodaysSummary())
    .catch(err => console.error('[Cron] Failed to schedule daily summary:', err))

  // Daily Google Calendar sync
  const googleSyncCron = process.env.GOOGLE_SYNC_CRON ?? '0 3 * * *'
  cron.schedule(googleSyncCron, async () => {
    console.log('[Cron] Google Calendar sync started')
    try {
      const result = await syncGoogleCalendars()
      if (result.errors.length > 0) {
        console.error('[Cron] Google Calendar sync completed with errors:', result.errors)
      } else {
        console.log('[Cron] Google Calendar sync completed successfully')
      }
    } catch (error) {
      console.error('[Cron] Google Calendar sync failed:', error)
    }
  }, { timezone: 'Europe/Madrid' })

  console.log(`[Cron] Google Calendar sync scheduled: ${googleSyncCron}`)

  // Reminder notifications — check every minute for reminders starting in the next 5 minutes
  const notifiedIds = new Set<number>()

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      const fiveMinLater = new Date(now.getTime() + 5 * 60 * 1000)

      const upcoming = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.type, 'reminder'),
            gte(events.start, now.toISOString()),
            lte(events.start, fiveMinLater.toISOString()),
          )
        )

      const chatId = process.env.TELEGRAM_AUTHORIZED_USER_ID
      if (!bot || !chatId) return

      for (const reminder of upcoming) {
        if (notifiedIds.has(reminder.id)) continue
        notifiedIds.add(reminder.id)

        const timeFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Madrid',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(reminder.start))

        const loc = reminder.location ? `\n📍 ${reminder.location}` : ''
        await bot.api.sendMessage(
          Number(chatId),
          `🔔 *Reminder at ${timeFmt}:* ${reminder.title}${loc}`,
          { parse_mode: 'Markdown' }
        )
        console.log(`[Cron] Reminder notification sent: ${reminder.title}`)
      }

      // Clean up old IDs to prevent unbounded growth
      if (notifiedIds.size > 1000) {
        const activeIds = new Set(upcoming.map(r => r.id))
        for (const id of notifiedIds) {
          if (!activeIds.has(id)) notifiedIds.delete(id)
        }
      }
    } catch (error) {
      console.error('[Cron] Reminder check failed:', error)
    }
  })

  console.log('[Cron] Reminder notifications scheduled: every minute')
}
