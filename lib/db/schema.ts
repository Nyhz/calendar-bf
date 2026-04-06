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
  event: '#3B82F6',
  meeting: '#22C55E',
  birthday: '#A855F7',
  reminder: '#EAB308',
  holiday: '#EF4444',
}
