// lib/settings.ts
import { eq } from 'drizzle-orm'
import { db } from './db'
import { appSettings } from './db/schema'

export async function getSetting(key: string, fallback: string): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key))
  return row?.value ?? fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings)
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
