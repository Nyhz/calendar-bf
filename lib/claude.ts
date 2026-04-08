import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

type ParsedEvent = {
  title: string
  start: string
  end: string
  allDay: boolean
  type: 'event' | 'meeting' | 'birthday' | 'reminder'
  location?: string
  description?: string
}

type SummaryEvent = {
  title: string
  start: string
  end: string
  type: string
  location?: string | null
}

export async function runClaude(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('claude', [
      '--system-prompt', systemPrompt,
      '--print',
      userMessage,
    ])
    return stdout.trim()
  } catch (error) {
    console.error('Claude subprocess error:', error)
    throw new Error('Claude subprocess failed')
  }
}

export async function parseEventFromText(freeText: string): Promise<ParsedEvent> {
  const today = new Date().toISOString().split('T')[0]

  const systemPrompt = `You are a calendar event parser. Parse the user's natural language input into a JSON object representing a calendar event.

The current timezone is Europe/Madrid. Today's date is ${today}.

Return ONLY a valid JSON object with exactly these fields:
{
  "title": string (required — short event title),
  "start": string (required — ISO 8601 UTC, e.g. "2026-04-10T15:00:00Z"),
  "end": string (required — ISO 8601 UTC, defaults to 1 hour after start if not specified. For reminders, end MUST equal start — reminders are point-in-time, they have no duration),
  "allDay": boolean (required — true only if explicitly an all-day event),
  "type": string (required — one of: "event", "meeting", "birthday", "reminder". Use "reminder" when the user's intent is to be reminded about something),
  "location": string or null (required — null if not mentioned),
  "description": string (required — always generate a brief description from the context provided, even if minimal. Capture who, what, or why if inferable.)
}

All fields are required. Never omit any field. Do not wrap the JSON in markdown code blocks. Return only the raw JSON object, nothing else.`

  const response = await runClaude(systemPrompt, freeText)

  const cleaned = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  return JSON.parse(cleaned) as ParsedEvent
}

export async function generateDailySummary(
  date: string,
  todayEvents: SummaryEvent[],
  weekEvents?: SummaryEvent[],
): Promise<string> {
  const isMonday = !!weekEvents

  const systemPrompt = isMonday
    ? `Eres un asistente personal de calendario. Genera un resumen semanal conciso en español para el lunes ${date}.

Empieza con los eventos de hoy, luego da un breve repaso del resto de la semana. Para cada evento, menciona el día, la hora (en zona horaria Europe/Madrid) y el título. Si el evento tiene ubicación, inclúyela. Agrupa los eventos cronológicamente por día.

Si un día no tiene eventos, puedes saltarlo. Si toda la semana está libre, dilo.

Responde solo con el texto del resumen, sin encabezados ni formato markdown.`
    : `Eres un asistente personal de calendario. Genera un resumen diario conciso en español para la fecha indicada.

Para cada evento, menciona la hora (en zona horaria Europe/Madrid) y el título. Si el evento tiene ubicación, inclúyela. Agrupa los eventos cronológicamente.

Si no hay eventos, indica que el día está libre.

Responde solo con el texto del resumen, sin encabezados ni formato markdown.`

  const userMessage = isMonday
    ? `Fecha: ${date}\n\nEventos de hoy:\n${JSON.stringify(todayEvents, null, 2)}\n\nResto de la semana:\n${JSON.stringify(weekEvents, null, 2)}`
    : `Fecha: ${date}\n\nEventos:\n${JSON.stringify(todayEvents, null, 2)}`

  return runClaude(systemPrompt, userMessage)
}
