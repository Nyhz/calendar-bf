// lib/google/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../db'
import { events, googleCalendars, integrations } from '../db/schema'
import { eq } from 'drizzle-orm'

// Mock the client module BEFORE importing sync
vi.mock('./client', () => ({
  getAuthedClient: vi.fn(),
  getIntegration: vi.fn(),
}))

// Mock googleapis
const listMock = vi.fn()
vi.mock('googleapis', () => ({
  google: {
    calendar: () => ({ events: { list: listMock } }),
  },
}))

import { syncGoogleCalendars } from './sync'
import { getAuthedClient, getIntegration } from './client'

describe('syncGoogleCalendars', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(events)
    await db.delete(googleCalendars)
    await db.delete(integrations)
    await db.insert(integrations).values({
      provider: 'google',
      accountEmail: 't@x',
      refreshToken: 'r',
      scopes: 'x',
    })
    await db.insert(googleCalendars).values({
      id: 'cal1',
      summary: 'Work',
      backgroundColor: '#ff0000',
      enabled: 1,
    })
    ;(getAuthedClient as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: 'google', accountEmail: 't@x', refreshToken: 'r',
    })
  })

  it('upserts events and persists syncToken', async () => {
    listMock.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'e1', summary: 'M', status: 'confirmed',
            start: { dateTime: '2026-05-01T10:00:00Z' },
            end: { dateTime: '2026-05-01T11:00:00Z' },
          },
        ],
        nextSyncToken: 'tok1',
      },
    })

    await syncGoogleCalendars()

    const [row] = await db.select().from(events)
    expect(row.title).toBe('M')
    expect(row.source).toBe('google')
    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, 'cal1'))
    expect(cal.syncToken).toBe('tok1')
  })

  it('deletes events with status=cancelled', async () => {
    await db.insert(events).values({
      title: 'M', start: '2026-05-01T10:00:00.000Z', end: '2026-05-01T11:00:00.000Z',
      color: '#ff0000', type: 'event', source: 'google',
      googleCalendarId: 'cal1', googleEventId: 'e1',
    })

    listMock.mockResolvedValueOnce({
      data: { items: [{ id: 'e1', status: 'cancelled' }], nextSyncToken: 'tok2' },
    })

    await syncGoogleCalendars()

    const rows = await db.select().from(events)
    expect(rows).toHaveLength(0)
  })

  it('recovers from 410 by clearing syncToken', async () => {
    await db.update(googleCalendars).set({ syncToken: 'stale' }).where(eq(googleCalendars.id, 'cal1'))

    const gone = Object.assign(new Error('Gone'), { code: 410 })
    listMock.mockRejectedValueOnce(gone).mockResolvedValueOnce({
      data: { items: [], nextSyncToken: 'fresh' },
    })

    await syncGoogleCalendars()

    const [cal] = await db.select().from(googleCalendars).where(eq(googleCalendars.id, 'cal1'))
    expect(cal.syncToken).toBe('fresh')
  })
})
