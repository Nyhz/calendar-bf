// app/api/integrations/google/sync/route.ts
import { NextResponse } from 'next/server'
import { syncGoogleCalendars, NotConnectedError, AlreadySyncingError } from '@/lib/google/sync'
import { getIntegration } from '@/lib/google/client'

export async function POST() {
  try {
    const { errors } = await syncGoogleCalendars()
    const row = await getIntegration()
    return NextResponse.json({
      data: { lastSyncAt: row?.lastSyncAt, errors },
    })
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
    }
    if (e instanceof AlreadySyncingError) {
      return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
