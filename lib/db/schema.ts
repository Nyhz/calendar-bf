import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  start: text('start').notNull(),
  end: text('end').notNull(),
  allDay: integer('all_day').notNull().default(0),
  type: text('type').notNull().default('event'),
  color: text('color').notNull(),
  description: text('description'),
  location: text('location'),
  recurrence: text('recurrence').default('none'),
  region: text('region'),
  source: text('source').notNull().default('local'),
  googleEventId: text('google_event_id'),
  googleCalendarId: text('google_calendar_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert

export const summaries = sqliteTable('summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  content: text('content').notNull(),
  generatedAt: text('generated_at').notNull().default(sql`(datetime('now'))`),
})

export type Summary = typeof summaries.$inferSelect
export type NewSummary = typeof summaries.$inferInsert

export const TYPE_COLORS: Record<string, string> = {
  event: '#00aaff',
  meeting: '#00ff41',
  birthday: '#00d4aa',
  reminder: '#ffbf00',
  holiday: '#ff3333',
}

export const integrations = sqliteTable('integrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull().unique(),
  accountEmail: text('account_email').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessExpiresAt: text('access_expires_at'),
  scopes: text('scopes').notNull(),
  connectedAt: text('connected_at').notNull().default(sql`(datetime('now'))`),
  lastSyncAt: text('last_sync_at'),
  lastSyncError: text('last_sync_error'),
})

export const googleCalendars = sqliteTable('google_calendars', {
  id: text('id').primaryKey(),
  summary: text('summary').notNull(),
  backgroundColor: text('background_color'),
  enabled: integer('enabled').notNull().default(0),
  syncToken: text('sync_token'),
  lastSyncAt: text('last_sync_at'),
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type GoogleCalendar = typeof googleCalendars.$inferSelect
export type NewGoogleCalendar = typeof googleCalendars.$inferInsert
export type AppSetting = typeof appSettings.$inferSelect
