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
    ? `You are a personal calendar assistant. Generate a concise weekly briefing in English for Monday ${date}.

Start with today's events, then give a brief overview of the rest of the week. For each event, mention the day, time (in Europe/Madrid timezone), and title. If the event has a location, include it. Group events chronologically by day.

If a day has no events, you can skip it. If the entire week is free, say so.

Respond only with the summary text, without headers or markdown formatting.`
    : `You are a personal calendar assistant. Generate a concise daily summary in English for the given date.

For each event, mention the time (in Europe/Madrid timezone) and the title. If the event has a location, include it. Group events chronologically.

If there are no events, indicate that the day is free.

Respond only with the summary text, without headers or markdown formatting.`

  const userMessage = isMonday
    ? `Date: ${date}\n\nToday's events:\n${JSON.stringify(todayEvents, null, 2)}\n\nRest of the week:\n${JSON.stringify(weekEvents, null, 2)}`
    : `Date: ${date}\n\nEvents:\n${JSON.stringify(todayEvents, null, 2)}`

  return runClaude(systemPrompt, userMessage)
}
