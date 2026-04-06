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

function formatEventTime(isoStr: string): string {
  const date = new Date(isoStr)
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatParsedEvent(ev: PendingEvent): string {
  const startTime = formatEventTime(ev.start)
  const endTime = formatEventTime(ev.end)
  const lines = [
    `📅 *${ev.title}*`,
    `🕐 ${startTime} — ${endTime}`,
    `📌 Tipo: ${ev.type}`,
  ]
  if (ev.location) lines.push(`📍 ${ev.location}`)
  if (ev.description) lines.push(`📝 ${ev.description}`)
  return lines.join('\n')
}

async function handleTextEvent(ctx: Context, text: string): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  await ctx.reply('🔄 Procesando tu evento...')

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
    .text('✅ Confirmar', 'confirm_event')
    .text('❌ Cancelar', 'cancel_event')

  await ctx.reply(`${formatParsedEvent(pending)}\n\n¿Quieres crear este evento?`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
}

export function registerHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    await ctx.reply(
      '¡Hola! Soy tu asistente de calendario. Puedo ayudarte a:\n\n' +
      '📝 *Crear eventos* — Envíame un mensaje de texto describiendo el evento\n' +
      '🎤 *Crear eventos por voz* — Envíame un mensaje de voz\n' +
      '📋 *Ver eventos de hoy* — Usa /hoy\n' +
      '📊 *Resumen diario* — Usa /resumen',
      { parse_mode: 'Markdown' }
    )
  })

  bot.command('hoy', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    try {
      const { start, end } = getTodayRangeMadrid()

      const todayEvents = await db
        .select()
        .from(events)
        .where(and(gte(events.start, start), lte(events.start, end)))

      if (todayEvents.length === 0) {
        await ctx.reply('No tienes eventos programados para hoy. 🎉')
        return
      }

      const lines = todayEvents.map((ev) => {
        const time = ev.allDay ? 'Todo el día' : formatEventTime(ev.start)
        const loc = ev.location ? ` — 📍 ${ev.location}` : ''
        return `• ${time} — ${ev.title}${loc}`
      })

      await ctx.reply(`📅 *Eventos de hoy:*\n\n${lines.join('\n')}`, {
        parse_mode: 'Markdown',
      })
    } catch (error) {
      console.error('[Telegram] /hoy error:', error)
      await ctx.reply('Lo siento, hubo un error al consultar los eventos de hoy.')
    }
  })

  bot.command('resumen', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    try {
      const { start, end, dateStr } = getTodayRangeMadrid()

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

      await ctx.reply('🔄 Generando resumen...')
      const summary = await generateDailySummary(dateStr, summaryEvents)
      await ctx.reply(summary)
    } catch (error) {
      console.error('[Telegram] /resumen error:', error)
      await ctx.reply('Lo siento, no pude generar el resumen. Inténtalo de nuevo más tarde.')
    }
  })

  bot.on('message:text', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    try {
      await handleTextEvent(ctx, ctx.message.text)
    } catch (error) {
      console.error('[Telegram] Text message error:', error)
      await ctx.reply('Lo siento, no pude procesar tu mensaje. Inténtalo de nuevo.')
    }
  })

  bot.on('message:voice', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      if (!botToken) {
        await ctx.reply('Error de configuración: token del bot no disponible.')
        return
      }

      await ctx.replyWithChatAction('typing')

      const fileId = ctx.message.voice.file_id
      const filePath = await downloadTelegramFile(botToken, fileId)
      const transcription = await transcribeAudio(filePath)

      await ctx.reply(`🎤 Transcripción: ${transcription}`)
      await handleTextEvent(ctx, transcription)
    } catch (error) {
      console.error('[Telegram] Voice message error:', error)
      await ctx.reply('Lo siento, no pude procesar tu mensaje de voz. Inténtalo de nuevo.')
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.answerCallbackQuery({ text: 'No autorizado.' })
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
        await ctx.answerCallbackQuery({ text: 'No hay evento pendiente.' })
        await ctx.editMessageText('Este evento ya no está disponible.')
        return
      }

      try {
        const [created] = await db.insert(events).values(pending).returning()
        pendingEvents.delete(chatId)
        await ctx.answerCallbackQuery({ text: '¡Evento creado!' })
        await ctx.editMessageText(`✅ Evento "${created.title}" creado correctamente.`)
      } catch (error) {
        console.error('[Telegram] confirm_event error:', error)
        await ctx.answerCallbackQuery({ text: 'Error al crear el evento.' })
        await ctx.reply('Lo siento, hubo un error al guardar el evento.')
      }
    } else if (action === 'cancel_event') {
      pendingEvents.delete(chatId)
      await ctx.answerCallbackQuery({ text: 'Evento cancelado.' })
      await ctx.editMessageText('❌ Evento cancelado.')
    } else {
      await ctx.answerCallbackQuery()
    }
  })
}
