import type { Bot, Context } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { randomUUID } from 'crypto'
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

type PendingEntry = {
  event: PendingEvent
  chatId: number
  createdAt: number
}

// Edit flow states
type EditField = 'title' | 'start' | 'end' | 'type' | 'done'
type EditSession = {
  pendingId: string
  currentField: EditField
}

const EXPIRY_MS = 30 * 60 * 1000 // 30 minutes
const EDIT_FIELDS: EditField[] = ['title', 'start', 'end', 'type']

const pendingEvents = new Map<string, PendingEntry>()
const editSessions = new Map<number, EditSession>() // keyed by chatId

function cleanExpired(): void {
  const now = Date.now()
  for (const [id, entry] of pendingEvents) {
    if (now - entry.createdAt > EXPIRY_MS) pendingEvents.delete(id)
  }
}

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
    const dateFmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(ev.start))
    lines.push(`🗓 ${dateFmt} (todo el día)`)
  } else if (ev.type === 'reminder') {
    lines.push(`🕐 ${formatEventTime(ev.start)}`)
  } else {
    const startTime = formatEventTime(ev.start)
    const endTime = formatEventTime(ev.end)
    lines.push(`🕐 ${startTime} — ${endTime}`)
  }
  lines.push(`📌 Tipo: ${ev.type}`)
  if (ev.location) lines.push(`📍 ${ev.location}`)
  if (ev.description) lines.push(`📝 ${ev.description}`)
  return lines.join('\n')
}

function getEditPrompt(field: EditField, ev: PendingEvent): string {
  switch (field) {
    case 'title':
      return `¿Qué título quieres? (actual: ${ev.title})\nEnvía "-" para mantener el actual.`
    case 'start':
      return `¿Fecha y hora de inicio? (actual: ${formatEventTime(ev.start)})\nEnvía "-" para mantener el actual.`
    case 'end':
      return ev.type === 'reminder'
        ? '' // skip end for reminders
        : `¿Fecha y hora de fin? (actual: ${formatEventTime(ev.end)})\nEnvía "-" para mantener el actual.`
    case 'type':
      return `¿Tipo? (actual: ${ev.type})\nOpciones: event, meeting, birthday, reminder\nEnvía "-" para mantener el actual.`
    default:
      return ''
  }
}

function nextEditField(current: EditField, ev: PendingEvent): EditField {
  const idx = EDIT_FIELDS.indexOf(current)
  for (let i = idx + 1; i < EDIT_FIELDS.length; i++) {
    const field = EDIT_FIELDS[i]
    // Skip 'end' for reminders
    if (field === 'end' && ev.type === 'reminder') continue
    return field
  }
  return 'done'
}

async function sendConfirmation(ctx: Context, pendingId: string, ev: PendingEvent): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('✅ Confirmar', `confirm:${pendingId}`)
    .text('✏️ Editar', `edit:${pendingId}`)
    .text('❌ Cancelar', `cancel:${pendingId}`)

  await ctx.reply(`${formatParsedEvent(ev)}\n\n¿Quieres crear este evento?`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
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

  cleanExpired()
  const pendingId = randomUUID().slice(0, 8)
  pendingEvents.set(pendingId, { event: pending, chatId, createdAt: Date.now() })

  await sendConfirmation(ctx, pendingId, pending)
}

async function handleEditReply(ctx: Context, text: string): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const session = editSessions.get(chatId)
  if (!session) return

  const entry = pendingEvents.get(session.pendingId)
  if (!entry) {
    editSessions.delete(chatId)
    await ctx.reply('Esta acción ha expirado. Por favor, intenta de nuevo.')
    return
  }

  const ev = entry.event

  // Apply edit if not "-"
  if (text.trim() !== '-') {
    switch (session.currentField) {
      case 'title':
        ev.title = text.trim()
        break
      case 'start': {
        // Re-parse through Claude for natural language date input
        const parsed = await parseEventFromText(`${ev.title} ${text.trim()}`)
        ev.start = parsed.start
        if (ev.type === 'reminder') ev.end = ev.start
        break
      }
      case 'end': {
        const parsed = await parseEventFromText(`${ev.title} hasta ${text.trim()}`)
        ev.end = parsed.end
        break
      }
      case 'type': {
        const validTypes = ['event', 'meeting', 'birthday', 'reminder']
        const normalized = text.trim().toLowerCase()
        if (validTypes.includes(normalized)) {
          ev.type = normalized
          ev.color = TYPE_COLORS[normalized] || TYPE_COLORS.event
          if (normalized === 'reminder') ev.end = ev.start
        } else {
          await ctx.reply(`Tipo no válido. Opciones: ${validTypes.join(', ')}`)
          return // Ask again
        }
        break
      }
    }
  }

  // Move to next field
  const next = nextEditField(session.currentField, ev)

  if (next === 'done') {
    editSessions.delete(chatId)
    await sendConfirmation(ctx, session.pendingId, ev)
  } else {
    session.currentField = next
    const prompt = getEditPrompt(next, ev)
    await ctx.reply(prompt)
  }
}

export function registerHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    await ctx.reply(
      '¡Hola! Soy tu asistente de calendario. Puedo ayudarte con:\n\n' +
      '📝 *Crear eventos* — Envíame un mensaje de texto describiendo el evento\n' +
      '🎤 *Crear eventos por voz* — Envíame una nota de voz\n' +
      '📋 *Ver eventos de hoy* — Usa /today\n' +
      '📊 *Resumen diario* — Usa /summary',
      { parse_mode: 'Markdown' }
    )
  })

  bot.command('today', async (ctx) => {
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
      console.error('[Telegram] /today error:', error)
      await ctx.reply('Ha ocurrido un error al obtener los eventos de hoy.')
    }
  })

  bot.command('summary', async (ctx) => {
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

      await ctx.reply('🔄 Generando resumen...')
      const summary = await generateDailySummary(dateStr, todaySummaryEvents, weekSummaryEvents)
      await ctx.reply(summary)
    } catch (error) {
      console.error('[Telegram] /summary error:', error)
      await ctx.reply('No pude generar el resumen. Por favor, inténtalo más tarde.')
    }
  })

  bot.on('message:text', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('No autorizado.')
      return
    }

    const chatId = ctx.chat?.id
    if (!chatId) return

    // Check if user is in an edit session
    if (editSessions.has(chatId)) {
      try {
        await handleEditReply(ctx, ctx.message.text)
      } catch (error) {
        console.error('[Telegram] Edit flow error:', error)
        editSessions.delete(chatId)
        await ctx.reply('Ha ocurrido un error durante la edición. Por favor, intenta de nuevo.')
      }
      return
    }

    try {
      await handleTextEvent(ctx, ctx.message.text)
    } catch (error) {
      console.error('[Telegram] Text message error:', error)
      await ctx.reply('No pude procesar tu mensaje. Por favor, inténtalo de nuevo.')
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
      await ctx.reply('No pude procesar tu nota de voz. Por favor, inténtalo de nuevo.')
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

    const data = ctx.callbackQuery.data
    const [action, pendingId] = data.split(':')

    if (!pendingId) {
      await ctx.answerCallbackQuery()
      return
    }

    cleanExpired()
    const entry = pendingEvents.get(pendingId)

    if (!entry) {
      await ctx.answerCallbackQuery({ text: 'Esta acción ha expirado.' })
      await ctx.editMessageText('Esta acción ha expirado. Por favor, intenta de nuevo.')
      return
    }

    if (action === 'confirm') {
      try {
        const [created] = await db.insert(events).values(entry.event).returning()
        pendingEvents.delete(pendingId)
        editSessions.delete(chatId)
        await ctx.answerCallbackQuery({ text: '¡Evento creado!' })
        await ctx.editMessageText(`✅ Evento "${created.title}" creado correctamente.`)
      } catch (error) {
        console.error('[Telegram] confirm error:', error)
        await ctx.answerCallbackQuery({ text: 'Error al crear el evento.' })
        await ctx.reply('Ha ocurrido un error al guardar el evento.')
      }
    } else if (action === 'edit') {
      const ev = entry.event
      const firstField: EditField = 'title'
      editSessions.set(chatId, { pendingId, currentField: firstField })
      await ctx.answerCallbackQuery()
      await ctx.editMessageText('✏️ Modo edición')
      const prompt = getEditPrompt(firstField, ev)
      await ctx.reply(prompt)
    } else if (action === 'cancel') {
      pendingEvents.delete(pendingId)
      editSessions.delete(chatId)
      await ctx.answerCallbackQuery({ text: 'Evento cancelado.' })
      await ctx.editMessageText('❌ Evento cancelado.')
    } else {
      await ctx.answerCallbackQuery()
    }
  })
}
