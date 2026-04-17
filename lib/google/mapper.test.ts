// lib/google/mapper.test.ts
import { describe, it, expect } from 'vitest'
import { mapRecurrence, mapGoogleEvent } from './mapper'

describe('mapRecurrence', () => {
  it('maps simple FREQ=DAILY', () => {
    expect(mapRecurrence(['RRULE:FREQ=DAILY'])).toBe('daily')
  })
  it('maps simple FREQ=WEEKLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=WEEKLY'])).toBe('weekly')
  })
  it('maps simple FREQ=MONTHLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=MONTHLY'])).toBe('monthly')
  })
  it('maps simple FREQ=YEARLY', () => {
    expect(mapRecurrence(['RRULE:FREQ=YEARLY'])).toBe('yearly')
  })
  it('falls back to none for BYDAY', () => {
    expect(mapRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])).toBe('none')
  })
  it('falls back to none for COUNT', () => {
    expect(mapRecurrence(['RRULE:FREQ=DAILY;COUNT=5'])).toBe('none')
  })
  it('returns none for no rules', () => {
    expect(mapRecurrence(undefined)).toBe('none')
    expect(mapRecurrence([])).toBe('none')
  })
})

describe('mapGoogleEvent', () => {
  const calendar = { id: 'cal@x', summary: 'Work', backgroundColor: '#ff0000', enabled: 1, syncToken: null, lastSyncAt: null }

  it('maps a timed event', () => {
    const g = {
      id: 'ev1',
      summary: 'Meeting',
      description: 'about X',
      location: 'Room 1',
      start: { dateTime: '2026-05-01T10:00:00Z' },
      end: { dateTime: '2026-05-01T11:00:00Z' },
      status: 'confirmed',
    }
    const out = mapGoogleEvent(g, calendar)
    expect(out).toMatchObject({
      title: 'Meeting',
      description: 'about X',
      location: 'Room 1',
      start: '2026-05-01T10:00:00.000Z',
      end: '2026-05-01T11:00:00.000Z',
      allDay: 0,
      type: 'event',
      source: 'google',
      color: '#ff0000',
      googleEventId: 'ev1',
      googleCalendarId: 'cal@x',
      recurrence: 'none',
    })
  })

  it('maps an all-day event', () => {
    const g = {
      id: 'ev2',
      summary: 'Holiday',
      start: { date: '2026-05-01' },
      end: { date: '2026-05-02' },
      status: 'confirmed',
    }
    const out = mapGoogleEvent(g, calendar)
    expect(out.allDay).toBe(1)
    expect(out.start).toBe('2026-05-01T00:00:00.000Z')
    expect(out.end).toBe('2026-05-01T23:59:59.000Z')
  })

  it('uses fallback title for empty summary', () => {
    const g = { id: 'ev3', start: { dateTime: '2026-05-01T10:00:00Z' }, end: { dateTime: '2026-05-01T11:00:00Z' }, status: 'confirmed' }
    expect(mapGoogleEvent(g, calendar).title).toBe('(no title)')
  })

  it('falls back to type color if calendar has no background', () => {
    const cal = { ...calendar, backgroundColor: null }
    const g = { id: 'e', summary: 'x', start: { dateTime: '2026-05-01T10:00:00Z' }, end: { dateTime: '2026-05-01T11:00:00Z' }, status: 'confirmed' }
    expect(mapGoogleEvent(g, cal).color).toBe('#00aaff')
  })
})
