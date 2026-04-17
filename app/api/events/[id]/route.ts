import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params
    const eventId = parseInt(id, 10)
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 })
    }

    const [event] = await db.select().from(events).where(eq(events.id, eventId))
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({ data: event })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params
    const eventId = parseInt(id, 10)
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 })
    }

    const [existing] = await db.select().from(events).where(eq(events.id, eventId))
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (existing.source !== 'local') {
      return NextResponse.json({ error: 'Events from external sources are read-only' }, { status: 403 })
    }

    const body = await request.json()

    // Allowlist: only update known mutable fields
    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.start !== undefined) updates.start = body.start
    if (body.end !== undefined) updates.end = body.end
    if (body.allDay !== undefined) updates.allDay = body.allDay
    if (body.type !== undefined) updates.type = body.type
    if (body.color !== undefined) updates.color = body.color
    if (body.description !== undefined) updates.description = body.description
    if (body.location !== undefined) updates.location = body.location
    if (body.recurrence !== undefined) updates.recurrence = body.recurrence
    if (body.region !== undefined) updates.region = body.region

    updates.updatedAt = new Date().toISOString()

    const [updated] = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, eventId))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params
    const eventId = parseInt(id, 10)
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 })
    }

    const [existing] = await db.select().from(events).where(eq(events.id, eventId))
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (existing.source !== 'local') {
      return NextResponse.json({ error: 'Events from external sources are read-only' }, { status: 403 })
    }

    await db.delete(events).where(eq(events.id, eventId))

    return NextResponse.json({ data: { deleted: true } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
