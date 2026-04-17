// lib/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { appSettings } from './db/schema'
import { getSetting, setSetting, getAllSettings } from './settings'

describe('settings', () => {
  beforeEach(async () => {
    await db.delete(appSettings)
  })

  it('returns default when key absent', async () => {
    const v = await getSetting('theme', 'system')
    expect(v).toBe('system')
  })

  it('round-trips a value', async () => {
    await setSetting('theme', 'dark')
    expect(await getSetting('theme', 'system')).toBe('dark')
  })

  it('returns all settings as a map', async () => {
    await setSetting('theme', 'dark')
    await setSetting('default_view', 'week')
    const all = await getAllSettings()
    expect(all).toEqual({ theme: 'dark', default_view: 'week' })
  })
})
