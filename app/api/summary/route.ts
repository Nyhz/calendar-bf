import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { summaries } from '@/lib/db/schema'
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
        { error: 'No summary for this date' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: summary })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Summary generation not available — Claude integration pending' },
    { status: 503 }
  )
}
