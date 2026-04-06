import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { eq, like, and } from 'drizzle-orm'
import { ensureHolidaysSeeded } from '@/lib/holidays'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)

    if (isNaN(year) || year < 1900 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 })
    }

    await ensureHolidaysSeeded(year)

    const holidays = await db
      .select()
      .from(events)
      .where(and(eq(events.type, 'holiday'), like(events.start, `${year}-%`)))

    return NextResponse.json({ data: holidays })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
