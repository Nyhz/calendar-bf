import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { events, summaries } from '@/lib/db/schema'
import { generateDailySummary } from '@/lib/claude'
import { eq, and, gte, lte } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const date = searchParams.get('date')

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const [summary] = await db
      .select()
      .from(summaries)
      .where(eq(summaries.date, date))

    if (!summary) {
      return NextResponse.json(
        { error: 'No summary found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date } = body

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Missing or invalid date field (expected YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const start = `${date}T00:00:00Z`
    const end = `${date}T23:59:59Z`

    const dayEvents = await db
      .select()
      .from(events)
      .where(and(gte(events.start, start), lte(events.start, end)))

    const toSummaryEvent = (ev: typeof dayEvents[number]) => ({
      title: ev.title,
      start: ev.start,
      end: ev.end,
      type: ev.type,
      location: ev.location,
    })

    const todaySummaryEvents = dayEvents.map(toSummaryEvent)

    // Check if the requested date is a Monday
    const reqDate = new Date(date + 'T12:00:00')
    const isMonday = reqDate.getDay() === 1
    let weekSummaryEvents: ReturnType<typeof toSummaryEvent>[] | undefined

    if (isMonday) {
      const sunday = new Date(reqDate)
      sunday.setDate(sunday.getDate() + 6)
      const tomorrow = new Date(reqDate)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const fmt = (d: Date) => d.toISOString().split('T')[0]
      const restOfWeek = await db
        .select()
        .from(events)
        .where(and(gte(events.start, `${fmt(tomorrow)}T00:00:00Z`), lte(events.start, `${fmt(sunday)}T23:59:59Z`)))
      weekSummaryEvents = restOfWeek.map(toSummaryEvent)
    }

    let content: string
    try {
      content = await generateDailySummary(date, todaySummaryEvents, weekSummaryEvents)
    } catch (error) {
      console.error('[Summary] Claude generation failed:', error)
      return NextResponse.json(
        { error: 'Summary generation failed' },
        { status: 503 }
      )
    }

    await db
      .insert(summaries)
      .values({ date, content })
      .onConflictDoUpdate({
        target: summaries.date,
        set: { content, generatedAt: new Date().toISOString() },
      })

    const [summary] = await db
      .select()
      .from(summaries)
      .where(eq(summaries.date, date))

    return NextResponse.json({ data: summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
