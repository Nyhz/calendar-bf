'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import DndProvider from './DndProvider'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { AgendaView } from './AgendaView'
import { Sidebar } from './Sidebar'
import { SummaryBanner } from './SummaryBanner'
import { EventForm } from './EventForm'
import { EventPopover } from './EventPopover'
import { cn } from '@/components/ui/utils'
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
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

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
  const { mutate } = useSWRConfig()

  const revalidateEvents = useCallback(() => {
    mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/events'))
  }, [mutate])

  const handleEventMove = useCallback(async (eventId: number, newStart: string, newEnd: string) => {
    // Optimistic update
    mutate(
      swrKey,
      (current: Event[] | undefined) =>
        current?.map(e =>
          (e.id === eventId ? { ...e, start: newStart, end: newEnd } : e)
        ),
      false,
    )

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: newStart, end: newEnd }),
      })
      if (!res.ok) {
        console.error('Failed to move event:', await res.text())
      }
    } catch (err) {
      console.error('Failed to move event:', err)
    }

    revalidateEvents()
  }, [swrKey, mutate, revalidateEvents])

  const handleEventResize = useCallback(async (eventId: number, newEnd: string) => {
    // Optimistic update
    mutate(
      swrKey,
      (current: Event[] | undefined) =>
        current?.map(e =>
          (e.id === eventId ? { ...e, end: newEnd } : e)
        ),
      false,
    )

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end: newEnd }),
      })
      if (!res.ok) {
        console.error('Failed to resize event:', await res.text())
      }
    } catch (err) {
      console.error('Failed to resize event:', err)
    }

    revalidateEvents()
  }, [swrKey, mutate, revalidateEvents])

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
    <div className="flex h-full flex-col bg-dr-bg">
      <SummaryBanner />

      {/* Header */}
      <header className="flex items-center gap-2 border-b border-dr-border bg-dr-surface px-4 py-2">
        <button
          onClick={goPrev}
          className="p-2 text-dr-muted transition-all hover:text-dr-green hover:shadow-glow-green"
          aria-label="Previous"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={goNext}
          className="p-2 text-dr-muted transition-all hover:text-dr-green hover:shadow-glow-green"
          aria-label="Next"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <h2 className="min-w-48 font-tactical text-lg uppercase tracking-widest text-dr-text">
          {headerLabel}
        </h2>

        <button
          onClick={goToday}
          className="border border-dr-green px-3 py-1 font-tactical text-sm uppercase tracking-wider text-dr-green transition-all hover:bg-dr-green/10 hover:shadow-glow-green"
        >
          Today
        </button>

        <div className="ml-auto flex items-center border border-dr-border bg-dr-bg">
          {views.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1 font-tactical text-sm uppercase tracking-wider transition-all',
                view === v
                  ? 'bg-dr-green/15 text-dr-green shadow-glow-green'
                  : 'text-dr-muted hover:bg-dr-hover hover:text-dr-text'
              )}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-70 shrink-0 overflow-y-auto border-r border-dr-border bg-dr-surface p-4 lg:block">
          <Sidebar
            currentDate={currentDate}
            onDateSelect={handleDateSelect}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </aside>

        {/* Active view */}
        <main className="flex-1 overflow-auto">
          {view === 'agenda' ? (
            <AgendaView
              currentDate={currentDate}
              events={events}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <DndProvider onEventMove={handleEventMove} onEventResize={handleEventResize}>
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
                  onEventResize={handleEventResize}
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
            </DndProvider>
          )}
        </main>
      </div>

      {/* Create Event FAB */}
      <button
        onClick={() => handleCreateEvent()}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center border border-dr-green bg-dr-green/10 text-dr-green shadow-glow-green transition-all hover:bg-dr-green/20"
        aria-label="Create event"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

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
