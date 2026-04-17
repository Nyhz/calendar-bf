// app/api/integrations/google/calendars/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { googleCalendars, events } from '@/lib/db/schema'
import { syncGoogleCalendars } from '@/lib/google/sync'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
    }

    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, id))
    if (!cal) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

    if (body.enabled && !cal.enabled) {
      await db.update(googleCalendars).set({ enabled: 1 }).where(eq(googleCalendars.id, id))
      await syncGoogleCalendars([id])
    } else if (!body.enabled && cal.enabled) {
      await db.delete(events).where(and(eq(events.source, 'google'), eq(events.googleCalendarId, id)))
      await db.update(googleCalendars).set({ enabled: 0, syncToken: null }).where(eq(googleCalendars.id, id))
    }

    const [updated] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, id))
    return NextResponse.json({ data: updated })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
