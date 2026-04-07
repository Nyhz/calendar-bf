const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Europe/Madrid'

export type CalendarDragData = {
  eventId: number
  originalStart: string
  originalEnd: string
  allDay: boolean
  sourceView: 'month' | 'week' | 'day'
  title: string
  color: string
}

export type CalendarDropData = {
  date: string
  time: string | null
  view: string
}

/**
 * Compute new UTC ISO 8601 start/end when an event is dropped on a new slot.
 *
 * - Time-grid drops (time !== null): drop time replaces start time, duration preserved.
 * - Month drops (time === null): date changes, time-of-day preserved.
 * - All-day events dropped on a date: start = T00:00:00Z, end = T23:59:59Z of that date.
 */
export function computeNewTimes(
  dragData: CalendarDragData,
  dropData: CalendarDropData,
): { start: string; end: string } {
  const durationMs =
    new Date(dragData.originalEnd).getTime() -
    new Date(dragData.originalStart).getTime()

  if (dragData.allDay) {
    return {
      start: `${dropData.date}T00:00:00Z`,
      end: `${dropData.date}T23:59:59Z`,
    }
  }

  if (dropData.time !== null) {
    // Time-grid drop: build a local datetime in Madrid, convert to UTC
    const localDatetime = `${dropData.date}T${dropData.time}:00`
    const newStartUtc = localToUtc(localDatetime)
    const newEndUtc = new Date(newStartUtc.getTime() + durationMs)
    return {
      start: newStartUtc.toISOString().replace('.000Z', 'Z'),
      end: newEndUtc.toISOString().replace('.000Z', 'Z'),
    }
  }

  // Month drop: preserve the time-of-day in Madrid, change only the date
  const originalLocalParts = utcToLocalParts(dragData.originalStart)
  const localDatetime = `${dropData.date}T${originalLocalParts.time}:00`
  const newStartUtc = localToUtc(localDatetime)
  const newEndUtc = new Date(newStartUtc.getTime() + durationMs)
  return {
    start: newStartUtc.toISOString().replace('.000Z', 'Z'),
    end: newEndUtc.toISOString().replace('.000Z', 'Z'),
  }
}

/**
 * Compute a new end time after resizing. Enforces a minimum 15-minute duration.
 */
export function computeResizedEnd(
  originalStart: string,
  originalEnd: string,
  deltaMinutes: number,
): string {
  const startMs = new Date(originalStart).getTime()
  const endMs = new Date(originalEnd).getTime()
  const newEndMs = endMs + deltaMinutes * 60 * 1000
  const minEndMs = startMs + 15 * 60 * 1000

  const finalMs = Math.max(newEndMs, minEndMs)
  return new Date(finalMs).toISOString().replace('.000Z', 'Z')
}

// --- Internal helpers ---

/** Convert a Madrid-local datetime string to a UTC Date. */
function localToUtc(localDatetime: string): Date {
  // Format the target local time, then find the UTC equivalent by binary-searching
  // the offset. We use Intl to get the actual offset for that date in Madrid.
  const approxUtc = new Date(localDatetime + 'Z')
  const offsetMs = getTimezoneOffsetMs(approxUtc)
  return new Date(approxUtc.getTime() - offsetMs)
}

/** Extract the local (Madrid) time-of-day from a UTC ISO string. */
function utcToLocalParts(utcIso: string): { time: string } {
  const date = new Date(utcIso)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return { time: formatter.format(date) }
}

/** Get the timezone offset in ms for a given UTC date in Madrid. */
function getTimezoneOffsetMs(utcDate: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(utcDate)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '0'

  const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  const localAsUtc = new Date(localStr)
  return localAsUtc.getTime() - utcDate.getTime()
}
