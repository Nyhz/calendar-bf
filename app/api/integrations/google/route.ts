import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { integrations, googleCalendars, events } from '@/lib/db/schema'
import { getIntegration, revokeToken } from '@/lib/google/client'

export async function GET() {
  try {
    const row = await getIntegration()
    if (!row) {
      return NextResponse.json({ data: { connected: false, calendars: [] } })
    }
    const calendars = await db.select().from(googleCalendars)
    return NextResponse.json({
      data: {
        connected: true,
        accountEmail: row.accountEmail,
        lastSyncAt: row.lastSyncAt,
        lastSyncError: row.lastSyncError,
        calendars,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const row = await getIntegration()
    if (!row) return NextResponse.json({ data: { ok: true } })
    await revokeToken(row.refreshToken)
    await db.delete(events).where(eq(events.source, 'google'))
    await db.delete(googleCalendars)
    await db.delete(integrations).where(eq(integrations.provider, 'google'))
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
