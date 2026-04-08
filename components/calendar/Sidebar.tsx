'use client'

import { MiniCalendar } from './MiniCalendar'
import { TYPE_COLORS } from '@/lib/db/schema'
import { cn } from '@/components/ui/utils'

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
  { key: 'event', label: 'Eventos' },
  { key: 'meeting', label: 'Reuniones' },
  { key: 'birthday', label: 'Cumpleaños' },
  { key: 'reminder', label: 'Recordatorios' },
  { key: 'holiday', label: 'Festivos' },
] as const

const HOLIDAY_REGIONS = [
  { key: 'national', label: 'Nacionales' },
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
    <div className="flex h-full flex-col gap-6 border-r border-dr-border bg-dr-surface">
      {/* Section 1: Mini Calendar */}
      <div className="px-3 pt-4">
        <MiniCalendar currentDate={currentDate} onDateSelect={onDateSelect} />
      </div>

      {/* Section 2: Event type filters */}
      <div className="px-3">
        <h3 className="mb-2 font-tactical text-[10px] uppercase tracking-widest text-dr-secondary">
          Tipos de evento
        </h3>
        <ul className="space-y-0.5">
          {EVENT_TYPES.map(({ key, label }) => {
            const checked = filters.types.includes(key)
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors hover:bg-dr-hover">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(key)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
                      checked ? 'border-transparent' : 'border-dr-border opacity-40',
                    )}
                    style={{ backgroundColor: checked ? TYPE_COLORS[key] : 'transparent' }}
                    aria-hidden="true"
                  >
                    {checked && (
                      <svg className="h-3 w-3 text-dr-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="font-data text-sm text-dr-secondary">{label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-dr-border" />

      {/* Section 3: Holiday region toggles */}
      <div className="px-3">
        <h3 className="mb-2 font-tactical text-[10px] uppercase tracking-widest text-dr-secondary">
          Festivos
        </h3>
        <ul className="space-y-0.5">
          {HOLIDAY_REGIONS.map(({ key, label }) => {
            const checked = filters.regions.includes(key)
            return (
              <li key={key}>
                <label
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 transition-colors',
                    holidayEnabled
                      ? 'cursor-pointer hover:bg-dr-hover'
                      : 'cursor-not-allowed opacity-40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRegion(key)}
                    disabled={!holidayEnabled}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border transition-colors',
                      checked && holidayEnabled
                        ? 'border-dr-green bg-dr-green/20'
                        : 'border-dr-border',
                    )}
                    aria-hidden="true"
                  >
                    {checked && (
                      <svg className="h-3 w-3 text-dr-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="font-data text-sm text-dr-secondary">{label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
