'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { cn } from '@/components/ui/utils'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

type Summary = {
  id: number
  date: string
  content: string
  generatedAt: string
}

function getTodayMadrid(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

const summaryFetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch summary')
  const json = await res.json()
  return json.data as Summary
}

const COLLAPSE_KEY = 'summaryBannerCollapsed'

export function SummaryBanner() {
  const today = getTodayMadrid()
  const { data: summary, mutate, isValidating } = useSWR<Summary | null>(
    `/api/summary?date=${today}`,
    summaryFetcher,
  )

  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, String(next))
      return next
    })
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      })
      await mutate()
    } finally {
      setRefreshing(false)
    }
  }, [today, mutate])

  if (summary === undefined && isValidating) return null
  if (!summary) return null

  return (
    <div className="bg-dr-surface border border-dr-border border-t-dr-teal shadow-[0_-2px_12px_rgba(0,212,170,0.15)] px-4 py-3">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 shrink-0 text-dr-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h3 className="font-tactical text-sm uppercase tracking-widest text-dr-teal">
          Daily Intelligence Briefing
        </h3>
        <span className="font-data text-xs text-dr-muted">{today}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 text-dr-muted transition-colors hover:text-dr-green disabled:opacity-50"
            aria-label="Regenerate summary"
          >
            <svg className={cn('h-4 w-4', refreshing && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={toggleCollapse}
            className="p-1.5 text-dr-muted transition-colors hover:text-dr-green"
            aria-label={collapsed ? 'Expand summary' : 'Collapse summary'}
          >
            <svg className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
      {refreshing && (
        <p className="mt-2 font-tactical text-xs uppercase tracking-widest text-dr-green animate-pulse">
          Generating...
        </p>
      )}
      {!collapsed && !refreshing && (
        <p className="mt-2 font-data text-sm leading-relaxed text-dr-secondary">
          {summary.content}
        </p>
      )}
    </div>
  )
}
