'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/components/ui/utils'

type MiniCalendarProps = {
  currentDate: Date
  onDateSelect: (date: Date) => void
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function MiniCalendar({ currentDate, onDateSelect }: MiniCalendarProps) {
  const [displayMonth, setDisplayMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))

  const today = useMemo(() => new Date(), [])

  const weeks = useMemo(() => {
    const year = displayMonth.getFullYear()
    const month = displayMonth.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const dow = firstOfMonth.getDay()
    // Monday = 0 offset. Sunday (0) maps to 6, others subtract 1
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const gridStart = new Date(year, month, 1 + mondayOffset)

    const rows: Date[][] = []
    for (let w = 0; w < 6; w++) {
      const week: Date[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridStart)
        date.setDate(gridStart.getDate() + w * 7 + d)
        week.push(date)
      }
      rows.push(week)
    }
    return rows
  }, [displayMonth])

  const headerLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayMonth)

  const goPrevMonth = () => setDisplayMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNextMonth = () => setDisplayMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={goPrevMonth}
          className="border border-dr-border p-1 text-dr-muted transition-colors hover:border-dr-dim hover:text-dr-green"
          aria-label="Mes anterior"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-tactical text-sm uppercase tracking-wider text-dr-text">{headerLabel}</span>
        <button
          onClick={goNextMonth}
          className="border border-dr-border p-1 text-dr-muted transition-colors hover:border-dr-dim hover:text-dr-green"
          aria-label="Mes siguiente"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <table className="w-full text-center text-xs" role="grid" aria-label="Mini calendar">
        <thead>
          <tr>
            {DAY_LABELS.map((label, i) => (
              <th key={i} className="py-1 font-tactical text-[10px] uppercase tracking-wider text-dr-dim" scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                const isCurrentMonth = date.getMonth() === displayMonth.getMonth()
                const isToday = isSameDay(date, today)
                const isSelected = isSameDay(date, currentDate)

                return (
                  <td key={di} className="p-0">
                    <button
                      onClick={() => onDateSelect(date)}
                      className={cn(
                        'h-7 w-7 font-data text-xs transition-colors',
                        isSelected
                          ? 'border border-dr-green bg-dr-green/10 font-semibold text-dr-green shadow-glow-green'
                          : isToday
                            ? 'bg-dr-green font-semibold text-dr-bg'
                            : isCurrentMonth
                              ? 'text-dr-secondary hover:bg-dr-hover'
                              : 'text-dr-dim hover:bg-dr-hover',
                      )}
                      aria-label={date.toLocaleDateString('en-US')}
                    >
                      {date.getDate()}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
