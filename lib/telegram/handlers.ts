import type { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { isAuthorized } from './bot'
import { parseEventFromText, generateDailySummary } from '../claude'
import { transcribeAudio, downloadTelegramFile } from '../whisper'
import { db } from '../db'
import { events, TYPE_COLORS } from '../db/schema'
import { and, gte, lte } from 'drizzle-orm'

type PendingEvent = {
  title: string
  start: string
  end: string
  allDay: number
  type: string
  color: string
  location?: string
  description?: string
}

const pendingEvents = new Map<number, PendingEvent>()

function getTodayRangeMadrid(): { start: string; end: string; dateStr: string } {
  const now = new Date()
  const madridDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  return {
    start: `${madridDate}T00:00:00Z`,
    end: `${madridDate}T23:59:59Z`,
    dateStr: madridDate,
  }
}

function isMondayMadrid(): boolean {
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(new Date())
  return dow === 'Mon'
}

function getSundayFromDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function formatEventTime(isoStr: string): string {
  const date = new Date(isoStr)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatParsedEvent(ev: PendingEvent): string {
  const lines = [
    `📅 *${ev.title}*`,
  ]
  if (ev.allDay) {
    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(ev.start))
    lines.push(`🗓 ${dateFmt} (all day)`)
  } else if (ev.type === 'reminder') {
    lines.push(`🕐 ${formatEventTime(ev.start)}`)
  } else {
    const startTime = formatEventTime(ev.start)
    const endTime = formatEventTime(ev.end)
    lines.push(`🕐 ${startTime} — ${endTime}`)
  }
  lines.push(`📌 Type: ${ev.type}`)
  if (ev.location) lines.push(`📍 ${ev.location}`)
  if (ev.description) lines.push(`📝 ${ev.description}`)
  return lines.join('\n')
}

async function handleTextEvent(ctx: Context, text: string): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  await ctx.reply('🔄 Processing your event...')

  const parsed = await parseEventFromText(text)
  const pending: PendingEvent = {
    title: parsed.title,
    start: parsed.start,
    end: parsed.end,
    allDay: parsed.allDay ? 1 : 0,
    type: parsed.type,
    color: TYPE_COLORS[parsed.type] || TYPE_COLORS.event,
    location: parsed.location,
    description: parsed.description,
  }

  pendingEvents.set(chatId, pending)

  const keyboard = new InlineKeyboard()
    .text('✅ Confirm', 'confirm_event')
    .text('❌ Cancel', 'cancel_event')

  await ctx.reply(`${formatParsedEvent(pending)}\n\nDo you want to create this event?`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
}

export function registerHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Not authorized.')
      return
    }

    await ctx.reply(
      'Hello! I\'m your calendar assistant. I can help you with:\n\n' +
      '📝 *Create events* — Send me a text message describing the event\n' +
      '🎤 *Create events by voice* — Send me a voice message\n' +
      '📋 *View today\'s events* — Use /today\n' +
      '📊 *Daily summary* — Use /summary',
      { parse_mode: 'Markdown' }
    )
  })

  bot.command('today', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Not authorized.')
      return
    }

    try {
      const { start, end } = getTodayRangeMadrid()

      const todayEvents = await db
        .select()
        .from(events)
        .where(and(gte(events.start, start), lte(events.start, end)))

      if (todayEvents.length === 0) {
        await ctx.reply('You have no events scheduled for today. 🎉')
        return
      }

      const lines = todayEvents.map((ev) => {
        const time = ev.allDay ? 'All day' : formatEventTime(ev.start)
        const loc = ev.location ? ` — 📍 ${ev.location}` : ''
        return `• ${time} — ${ev.title}${loc}`
      })

      await ctx.reply(`📅 *Today's events:*\n\n${lines.join('\n')}`, {
        parse_mode: 'Markdown',
      })
    } catch (error) {
      console.error('[Telegram] /today error:', error)
      await ctx.reply('Sorry, there was an error fetching today\'s events.')
    }
  })

  bot.command('summary', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Not authorized.')
      return
    }

    try {
      const { start, end, dateStr } = getTodayRangeMadrid()

      const todayEvents = await db
        .select()
        .from(events)
        .where(and(gte(events.start, start), lte(events.start, end)))

      const toSummaryEvent = (ev: typeof todayEvents[number]) => ({
        title: ev.title,
        start: ev.start,
        end: ev.end,
        type: ev.type,
        location: ev.location,
      })

      const todaySummaryEvents = todayEvents.map(toSummaryEvent)

      let weekSummaryEvents: ReturnType<typeof toSummaryEvent>[] | undefined
      if (isMondayMadrid()) {
        const sundayStr = getSundayFromDate(dateStr)
        const tomorrow = new Date(dateStr + 'T12:00:00')
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow)
        const restOfWeek = await db
          .select()
          .from(events)
          .where(and(gte(events.start, `${tomorrowStr}T00:00:00Z`), lte(events.start, `${sundayStr}T23:59:59Z`)))
        weekSummaryEvents = restOfWeek.map(toSummaryEvent)
      }

      await ctx.reply('🔄 Generating summary...')
      const summary = await generateDailySummary(dateStr, todaySummaryEvents, weekSummaryEvents)
      await ctx.reply(summary)
    } catch (error) {
      console.error('[Telegram] /summary error:', error)
      await ctx.reply('Sorry, I couldn\'t generate the summary. Please try again later.')
    }
  })

  bot.on('message:text', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Not authorized.')
      return
    }

    try {
      await handleTextEvent(ctx, ctx.message.text)
    } catch (error) {
      console.error('[Telegram] Text message error:', error)
      await ctx.reply('Sorry, I couldn\'t process your message. Please try again.')
    }
  })

  bot.on('message:voice', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Not authorized.')
      return
    }

    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (!botToken) {
        await ctx.reply('Configuration error: bot token not available.')
        return
      }

      await ctx.replyWithChatAction('typing')

      const fileId = ctx.message.voice.file_id
      const filePath = await downloadTelegramFile(botToken, fileId)
      const transcription = await transcribeAudio(filePath)

      await ctx.reply(`🎤 Transcription: ${transcription}`)
      await handleTextEvent(ctx, transcription)
    } catch (error) {
      console.error('[Telegram] Voice message error:', error)
      await ctx.reply('Sorry, I couldn\'t process your voice message. Please try again.')
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.answerCallbackQuery({ text: 'Not authorized.' })
      return
    }

    const chatId = ctx.chat?.id
    if (!chatId) {
      await ctx.answerCallbackQuery()
      return
    }

    const action = ctx.callbackQuery.data

    if (action === 'confirm_event') {
      const pending = pendingEvents.get(chatId)
      if (!pending) {
        await ctx.answerCallbackQuery({ text: 'No pending event.' })
        await ctx.editMessageText('This event is no longer available.')
        return
      }

      try {
        const [created] = await db.insert(events).values(pending).returning()
        pendingEvents.delete(chatId)
        await ctx.answerCallbackQuery({ text: 'Event created!' })
        await ctx.editMessageText(`✅ Event "${created.title}" created successfully.`)
      } catch (error) {
        console.error('[Telegram] confirm_event error:', error)
        await ctx.answerCallbackQuery({ text: 'Failed to create event.' })
        await ctx.reply('Sorry, there was an error saving the event.')
      }
    } else if (action === 'cancel_event') {
      pendingEvents.delete(chatId)
      await ctx.answerCallbackQuery({ text: 'Event cancelled.' })
      await ctx.editMessageText('❌ Event cancelled.')
    } else {
      await ctx.answerCallbackQuery()
    }
  })
}
