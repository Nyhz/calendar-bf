import { db } from './db'
import { events, TYPE_COLORS } from './db/schema'
import type { NewEvent } from './db/schema'
import { eq, like, sql, and } from 'drizzle-orm'

type NagerHoliday = {
  date: string
  localName: string
  name: string
  counties: string[] | null
  fixed: boolean
  global: boolean
  types: string[]
}

const SUPPORTED_REGIONS = ['ES-PV', 'ES-MD'] as const

export async function seedHolidaysFromAPI(year: number): Promise<void> {
  const response = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/ES`
  )

  if (!response.ok) {
    throw new Error(
      `Nager.Date API returned ${response.status} for year ${year}`
    )
  }

  const holidays: NagerHoliday[] = await response.json()
  const rows: NewEvent[] = []

  for (const holiday of holidays) {
    const regions: string[] = []

    if (!holiday.counties || holiday.counties.length === 0) {
      regions.push('national')
    } else {
      for (const region of SUPPORTED_REGIONS) {
        if (holiday.counties.includes(region)) {
          regions.push(region)
        }
      }
    }

    for (const region of regions) {
      rows.push({
        title: holiday.localName,
        start: `${holiday.date}T00:00:00Z`,
        end: `${holiday.date}T23:59:59Z`,
        allDay: 1,
        type: 'holiday',
        color: TYPE_COLORS.holiday,
        recurrence: 'none',
        region,
      })
    }
  }

  if (rows.length > 0) {
    await db.insert(events).values(rows)
  }
}

export async function ensureHolidaysSeeded(year: number): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.type, 'holiday'), like(events.start, `${year}-%`)))

  if (count === 0) {
    await seedHolidaysFromAPI(year)
  }
}
