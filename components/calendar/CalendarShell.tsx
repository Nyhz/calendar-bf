'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { AgendaView } from './AgendaView'
import { Sidebar } from './Sidebar'
import { SummaryBanner } from './SummaryBanner'
import { EventForm } from './EventForm'
import { EventPopover } from './EventPopover'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

type ViewType = 'month' | 'week' | 'day' | 'agenda'

type Filters = {
  types: string[]
  regions: string[]
}

const DEFAULT_FILTERS: Filters = {
  types: ['event', 'meeting', 'birthday', 'reminder', 'holiday'],
  regions: ['national'],
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  const json = await res.json()
  return json.data as Event[]
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getVisibleRange(date: Date, view: ViewType): { start: Date; end: Date } {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const dow = date.getDay()

  if (view === 'month') {
    const firstOfMonth = new Date(year, month, 1)
    const dayOfWeek = firstOfMonth.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const start = new Date(year, month, 1 + mondayOffset)
    const end = new Date(start)
    end.setDate(start.getDate() + 42)
    return { start, end }
  }

  if (view === 'week') {
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const start = new Date(year, month, day + mondayOffset)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return { start, end }
  }

  if (view === 'day') {
    const start = new Date(year, month, day)
    const end = new Date(year, month, day + 1)
    return { start, end }
  }

  // agenda: 30 days from today
  const start = new Date(year, month, day)
  const end = new Date(year, month, day + 30)
  return { start, end }
}

function navigateDate(date: Date, view: ViewType, direction: number): Date {
  const d = new Date(date)
  if (view === 'month') d.setMonth(d.getMonth() + direction)
  else if (view === 'week') d.setDate(d.getDate() + 7 * direction)
  else if (view === 'day') d.setDate(d.getDate() + direction)
  else d.setDate(d.getDate() + 30 * direction)
  return d
}

function formatHeader(date: Date, view: ViewType): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE })

  if (view === 'month') {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: TIMEZONE,
    }).format(date)
  }

  if (view === 'week') {
    const dow = date.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(date)
    monday.setDate(date.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const fmtRange = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      timeZone: TIMEZONE,
    })
    return `${fmtRange.format(monday)} – ${fmtRange.format(sunday)}`
  }

  if (view === 'day') {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: TIMEZONE,
    }).format(date)
  }

  return fmt.format(date)
}

function CalendarShellInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialView = (searchParams.get('view') as ViewType) || 'month'
  const initialDateStr = searchParams.get('date')
  const initialDate = initialDateStr ? new Date(initialDateStr + 'T12:00:00') : new Date()

  const [view, setView] = useState<ViewType>(initialView)
  const [currentDate, setCurrentDate] = useState<Date>(initialDate)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [darkMode, setDarkMode] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // Load dark mode preference
  useEffect(() => {
    const stored = localStorage.getItem('darkMode')
    if (stored === 'true') {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  // Load filter preferences
  useEffect(() => {
    const stored = localStorage.getItem('calendarFilters')
    if (stored) {
      try {
        setFilters(JSON.parse(stored))
      } catch { /* use defaults */ }
    }
  }, [])

  // Persist filters
  useEffect(() => {
    localStorage.setItem('calendarFilters', JSON.stringify(filters))
  }, [filters])

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('date', formatDateParam(currentDate))
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [view, currentDate, router])

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('darkMode', String(next))
      if (next) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return next
    })
  }, [])

  const { start, end } = useMemo(() => getVisibleRange(currentDate, view), [currentDate, view])

  const swrKey = useMemo(() => {
    const params = new URLSearchParams()
    params.set('start', start.toISOString())
    params.set('end', end.toISOString())
    if (filters.types.length > 0) params.set('types', filters.types.join(','))
    if (filters.regions.length > 0) params.set('regions', filters.regions.join(','))
    return `/api/events?${params.toString()}`
  }, [start, end, filters])

  const { data: events = [] } = useSWR<Event[]>(swrKey, fetcher)

  const handleCreateEvent = useCallback((date?: Date) => {
    setCreateDate(date ?? null)
    setShowCreateForm(true)
  }, [])

  const handleSelectEvent = useCallback((event: Event) => {
    setSelectedEvent(event)
  }, [])

  const handleDateSelect = useCallback((date: Date) => {
    setCurrentDate(date)
    setView('day')
  }, [])

  const handleEditFromPopover = useCallback((event: Event) => {
    setSelectedEvent(null)
    setEditingEvent(event)
  }, [])

  const handleCloseForm = useCallback(() => {
    setShowCreateForm(false)
    setEditingEvent(null)
    setCreateDate(null)
  }, [])

  const goToday = useCallback(() => setCurrentDate(new Date()), [])
  const goPrev = useCallback(() => setCurrentDate(d => navigateDate(d, view, -1)), [view])
  const goNext = useCallback(() => setCurrentDate(d => navigateDate(d, view, 1)), [view])

  const headerLabel = formatHeader(currentDate, view)

  const views: ViewType[] = ['month', 'week', 'day', 'agenda']
  const viewLabels: Record<ViewType, string> = {
    month: 'Month',
    week: 'Week',
    day: 'Day',
    agenda: 'Agenda',
  }

  return (
    <div className="flex h-full flex-col">
      <SummaryBanner />

      {/* Header */}
      <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          onClick={goPrev}
          className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Previous"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goNext}
          className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Next"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <h2 className="min-w-48 text-lg font-semibold capitalize">{headerLabel}</h2>

        <button
          onClick={goToday}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
        >
          Today
        </button>

        <div className="ml-auto flex items-center gap-1">
          {views.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-sm ${
                view === v
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>

        <button
          onClick={() => handleCreateEvent()}
          className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
          aria-label="Create event"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <button
          onClick={toggleDarkMode}
          className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-70 shrink-0 overflow-y-auto border-r border-gray-200 p-4 dark:border-gray-700 lg:block">
          <Sidebar
            currentDate={currentDate}
            onDateSelect={handleDateSelect}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </aside>

        {/* Active view */}
        <main className="flex-1 overflow-auto">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onCreateEvent={handleCreateEvent}
              onSelectEvent={handleSelectEvent}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onCreateEvent={handleCreateEvent}
              onSelectEvent={handleSelectEvent}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              onCreateEvent={handleCreateEvent}
              onSelectEvent={handleSelectEvent}
            />
          )}
          {view === 'agenda' && (
            <AgendaView
              currentDate={currentDate}
              events={events}
              onSelectEvent={handleSelectEvent}
            />
          )}
        </main>
      </div>

      {/* Event Create/Edit Form */}
      <EventForm
        open={showCreateForm || !!editingEvent}
        onClose={handleCloseForm}
        event={editingEvent}
        defaultDate={createDate}
      />

      {/* Event Detail Popover */}
      <EventPopover
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={handleEditFromPopover}
      />
    </div>
  )
}

export function CalendarShell() {
  return (
    <Suspense>
      <CalendarShellInner />
    </Suspense>
  )
}
