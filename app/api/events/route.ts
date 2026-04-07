import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { events, TYPE_COLORS } from '@/lib/db/schema'
import type { Event } from '@/lib/db/schema'
import { and, gte, lte, inArray, isNull, or } from 'drizzle-orm'

function isValidISO(s: string): boolean {
  const d = new Date(s)
  return !isNaN(d.getTime())
}

function expandRecurring(event: Event, rangeStart: Date, rangeEnd: Date): Event[] {
  const recurrence = event.recurrence
  if (!recurrence || recurrence === 'none') return []

  const baseStart = new Date(event.start)
  const baseEnd = new Date(event.end)
  const durationMs = baseEnd.getTime() - baseStart.getTime()
  const expanded: Event[] = []

  const cursor = new Date(baseStart)
  // Cap iterations to prevent unbounded expansion
  const maxIterations = 1000
  let iterations = 0

  while (cursor <= rangeEnd && iterations < maxIterations) {
    iterations++

    if (cursor > baseStart && cursor >= rangeStart) {
      const occurrenceStart = new Date(cursor)
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs)

      if (occurrenceEnd >= rangeStart) {
        const isoDate = occurrenceStart.toISOString().slice(0, 10)
        expanded.push({
          ...event,
          id: parseInt(`${event.id}`), // keep numeric for type, synthetic id in string form below
          start: occurrenceStart.toISOString(),
          end: occurrenceEnd.toISOString(),
          // Attach synthetic id via a cast — consumers read id as string
        })
        // Override id to synthetic composite
        const last = expanded[expanded.length - 1]
        ;(last as Record<string, unknown>).id = `${event.id}_${isoDate}` as unknown as number
      }
    }

    switch (recurrence) {
      case 'daily':
        cursor.setUTCDate(cursor.getUTCDate() + 1)
        break
      case 'weekly':
        cursor.setUTCDate(cursor.getUTCDate() + 7)
        break
      case 'monthly':
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        break
      case 'yearly':
        cursor.setUTCFullYear(cursor.getUTCFullYear() + 1)
        break
      default:
        return expanded
    }
  }

  return expanded
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const typesParam = searchParams.get('types')
    const regionsParam = searchParams.get('regions')

    const conditions = []

    if (start) {
      conditions.push(gte(events.end, start))
    }
    if (end) {
      conditions.push(lte(events.start, end))
    }
    if (typesParam) {
      const types = typesParam.split(',').map(t => t.trim()).filter(Boolean)
      if (types.length > 0) {
        conditions.push(inArray(events.type, types))
      }
    }
    if (regionsParam) {
      const regions = regionsParam.split(',').map(r => r.trim()).filter(Boolean)
      if (regions.length > 0) {
        // User events (region IS NULL) always show, plus matching regions
        conditions.push(
          or(isNull(events.region), inArray(events.region, regions))!
        )
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const rows = await db.select().from(events).where(where)

    // Deduplicate holidays that share the same title+date across regions.
    // When a holiday appears in multiple regions (e.g. national + ES-PV),
    // keep only the one with highest priority: national > ES-PV > ES-MD.
    const regionPriority: Record<string, number> = { national: 0, 'ES-PV': 1, 'ES-MD': 2 }
    const holidaySeen = new Map<string, number>()
    const deduped: Event[] = []

    for (const event of rows) {
      if (event.type === 'holiday' && event.region) {
        const key = `${event.title}::${event.start}`
        const existingIdx = holidaySeen.get(key)
        if (existingIdx !== undefined) {
          // Keep the one with higher priority (lower number)
          const existing = deduped[existingIdx]
          const existingPri = regionPriority[existing.region ?? ''] ?? 99
          const currentPri = regionPriority[event.region] ?? 99
          if (currentPri < existingPri) {
            deduped[existingIdx] = event
          }
          continue
        }
        holidaySeen.set(key, deduped.length)
      }
      deduped.push(event)
    }

    // Expand recurring events if a date range is provided
    if (start && end) {
      const rangeStart = new Date(start)
      const rangeEnd = new Date(end)
      const result: Event[] = []

      for (const event of deduped) {
        result.push(event)
        if (event.recurrence && event.recurrence !== 'none') {
          result.push(...expandRecurring(event, rangeStart, rangeEnd))
        }
      }

      return NextResponse.json({ data: result })
    }

    return NextResponse.json({ data: deduped })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { title, start, end, type, color, ...rest } = body

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required and must be non-empty' }, { status: 400 })
    }
    if (!start || typeof start !== 'string' || !isValidISO(start)) {
      return NextResponse.json({ error: 'start is required and must be a valid ISO 8601 string' }, { status: 400 })
    }
    if (!end || typeof end !== 'string' || !isValidISO(end)) {
      return NextResponse.json({ error: 'end is required and must be a valid ISO 8601 string' }, { status: 400 })
    }
    if (new Date(end) <= new Date(start)) {
      return NextResponse.json({ error: 'end must be after start' }, { status: 400 })
    }

    const eventType = type || 'event'

    if (eventType === 'holiday') {
      return NextResponse.json({ error: 'Holidays are system-managed' }, { status: 403 })
    }

    const eventColor = color || TYPE_COLORS[eventType] || TYPE_COLORS.event

    const allowedFields: Record<string, unknown> = {
      title: title.trim(),
      start,
      end,
      type: eventType,
      color: eventColor,
    }

    // Allowlist optional fields
    if (rest.allDay !== undefined) allowedFields.allDay = rest.allDay
    if (rest.description !== undefined) allowedFields.description = rest.description
    if (rest.location !== undefined) allowedFields.location = rest.location
    if (rest.recurrence !== undefined) allowedFields.recurrence = rest.recurrence
    if (rest.region !== undefined) allowedFields.region = rest.region

    const [created] = await db.insert(events).values(allowedFields as typeof events.$inferInsert).returning()

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
