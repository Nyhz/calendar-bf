import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { summaries } from '@/lib/db/schema'
import { generateAndStoreSummary } from '@/lib/summary'
import { eq } from 'drizzle-orm'

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

    try {
      await generateAndStoreSummary(date, { sendTelegram: true })
    } catch (error) {
      console.error('[Summary] Generation failed:', error)
      return NextResponse.json(
        { error: 'Summary generation failed' },
        { status: 503 }
      )
    }

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
