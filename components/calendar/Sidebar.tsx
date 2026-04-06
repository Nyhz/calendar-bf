'use client'

import { MiniCalendar } from './MiniCalendar'
import { TYPE_COLORS } from '@/lib/db/schema'

type Filters = {
  types: string[]
  regions: string[]
}

type SidebarProps = {
  currentDate: Date
  onDateSelect: (date: Date) => void
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

const EVENT_TYPES = [
  { key: 'event', label: 'Evento' },
  { key: 'meeting', label: 'Reunión' },
  { key: 'birthday', label: 'Cumpleaños' },
  { key: 'reminder', label: 'Recordatorio' },
  { key: 'holiday', label: 'Festivo' },
] as const

const HOLIDAY_REGIONS = [
  { key: 'national', label: 'Nacional' },
  { key: 'ES-PV', label: 'País Vasco' },
  { key: 'ES-MD', label: 'Madrid' },
] as const

export function Sidebar({ currentDate, onDateSelect, filters, onFiltersChange }: SidebarProps) {
  const holidayEnabled = filters.types.includes('holiday')

  const toggleType = (type: string) => {
    const types = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type]
    onFiltersChange({ ...filters, types })
  }

  const toggleRegion = (region: string) => {
    const regions = filters.regions.includes(region)
      ? filters.regions.filter(r => r !== region)
      : [...filters.regions, region]
    onFiltersChange({ ...filters, regions })
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Section 1: Mini Calendar */}
      <MiniCalendar currentDate={currentDate} onDateSelect={onDateSelect} />

      {/* Section 2: Event type filters */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Tipos de evento
        </h3>
        <ul className="space-y-1">
          {EVENT_TYPES.map(({ key, label }) => (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={filters.types.includes(key)}
                  onChange={() => toggleType(key)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                    filters.types.includes(key) ? '' : 'opacity-30'
                  }`}
                  style={{ backgroundColor: TYPE_COLORS[key] }}
                  aria-hidden="true"
                >
                  {filters.types.includes(key) && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm">{label}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Section 3: Holiday region toggles */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Regiones festivas
        </h3>
        <ul className="space-y-1">
          {HOLIDAY_REGIONS.map(({ key, label }) => (
            <li key={key}>
              <label
                className={`flex items-center gap-2 rounded px-2 py-1 ${
                  holidayEnabled
                    ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'cursor-not-allowed opacity-40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={filters.regions.includes(key)}
                  onChange={() => toggleRegion(key)}
                  disabled={!holidayEnabled}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-red-500 accent-red-500 disabled:opacity-50"
                />
                <span className="text-sm">{label}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
