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

Return ONLY a valid JSON object with these fields:
- title (string, required)
- start (string, ISO 8601 UTC, required)
- end (string, ISO 8601 UTC, required)
- allDay (boolean, required)
- type (one of: "event", "meeting", "birthday", "reminder")
- location (string, optional — omit if not mentioned)
- description (string, optional — omit if not mentioned)

Do not wrap the JSON in markdown code blocks. Return only the raw JSON object.`

  const response = await runClaude(systemPrompt, freeText)

  const cleaned = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  return JSON.parse(cleaned) as ParsedEvent
}

export async function generateDailySummary(date: string, events: SummaryEvent[]): Promise<string> {
  const systemPrompt = `Eres un asistente de calendario personal. Genera un resumen diario conciso en español para la fecha indicada.

Para cada evento, menciona la hora (en zona horaria Europe/Madrid) y el título. Si el evento tiene ubicación, inclúyela. Agrupa los eventos cronológicamente.

Si no hay eventos, indica que el día está libre.

Responde solo con el texto del resumen, sin encabezados ni formato markdown.`

  const userMessage = `Fecha: ${date}\n\nEventos:\n${JSON.stringify(events, null, 2)}`

  return runClaude(systemPrompt, userMessage)
}
