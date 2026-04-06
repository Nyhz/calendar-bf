'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useSWRConfig } from 'swr'
import { Modal } from '@/components/ui/Modal'
import { TYPE_COLORS } from '@/lib/db/schema'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

const EVENT_TYPES = ['event', 'meeting', 'birthday', 'reminder'] as const
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'No repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

type EventFormProps = {
  open: boolean
  onClose: () => void
  event?: Event | null
  defaultDate?: Date | null
}

function utcToLocalInput(utcIso: string): string {
  const date = new Date(utcIso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function localInputToUtc(localValue: string): string {
  // localValue is in Madrid time, we need to convert to UTC
  // Create a formatter that gives us the offset
  const dateInMadrid = new Date(localValue)
  const utcDate = new Date(
    dateInMadrid.toLocaleString('en-US', { timeZone: 'UTC' })
  )
  const madridDate = new Date(
    dateInMadrid.toLocaleString('en-US', { timeZone: TIMEZONE })
  )
  const offset = madridDate.getTime() - utcDate.getTime()
  return new Date(dateInMadrid.getTime() - offset).toISOString()
}

function getDefaultStart(defaultDate?: Date | null): string {
  if (defaultDate) {
    return utcToLocalInput(defaultDate.toISOString())
  }
  const now = new Date()
  now.setMinutes(0, 0, 0)
  now.setHours(now.getHours() + 1)
  return utcToLocalInput(now.toISOString())
}

function getDefaultEnd(startLocal: string): string {
  const startDate = new Date(startLocal)
  startDate.setHours(startDate.getHours() + 1)
  const y = startDate.getFullYear()
  const m = String(startDate.getMonth() + 1).padStart(2, '0')
  const d = String(startDate.getDate()).padStart(2, '0')
  const h = String(startDate.getHours()).padStart(2, '0')
  const min = String(startDate.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export function EventForm({ open, onClose, event, defaultDate }: EventFormProps) {
  const { mutate } = useSWRConfig()
  const isEdit = !!event

  const defaultStart = isEdit
    ? utcToLocalInput(event.start)
    : getDefaultStart(defaultDate)

  const [title, setTitle] = useState(event?.title ?? '')
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(
    isEdit ? utcToLocalInput(event.end) : getDefaultEnd(defaultStart)
  )
  const [allDay, setAllDay] = useState(isEdit ? event.allDay === 1 : false)
  const [type, setType] = useState(event?.type ?? 'event')
  const [color, setColor] = useState(event?.color ?? TYPE_COLORS['event'])
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [recurrence, setRecurrence] = useState(event?.recurrence ?? 'none')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Reset form when event/defaultDate changes
  useEffect(() => {
    if (!open) return
    const s = isEdit ? utcToLocalInput(event.start) : getDefaultStart(defaultDate)
    setTitle(event?.title ?? '')
    setStart(s)
    setEnd(isEdit ? utcToLocalInput(event.end) : getDefaultEnd(s))
    setAllDay(isEdit ? event.allDay === 1 : false)
    setType(event?.type ?? 'event')
    setColor(event?.color ?? TYPE_COLORS['event'])
    setDescription(event?.description ?? '')
    setLocation(event?.location ?? '')
    setRecurrence(event?.recurrence ?? 'none')
    setErrors({})
  }, [open, event, defaultDate, isEdit])

  // Auto-update color when type changes (only if not manually overridden)
  const handleTypeChange = (newType: string) => {
    setType(newType)
    if (color === TYPE_COLORS[type]) {
      setColor(TYPE_COLORS[newType] ?? TYPE_COLORS['event'])
    }
  }

  // Auto-adjust end when start changes
  const handleStartChange = (newStart: string) => {
    setStart(newStart)
    if (!isEdit) {
      setEnd(getDefaultEnd(newStart))
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!allDay && start && end && new Date(end) <= new Date(start)) {
      errs.end = 'End time must be after start time'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)

    let startUtc: string
    let endUtc: string

    if (allDay) {
      // Extract just the date part from the local input
      const startDate = start.split('T')[0]
      const endDate = end.split('T')[0] || startDate
      startUtc = `${startDate}T00:00:00Z`
      endUtc = `${endDate}T23:59:59Z`
    } else {
      startUtc = localInputToUtc(start)
      endUtc = localInputToUtc(end)
    }

    const body = {
      title: title.trim(),
      start: startUtc,
      end: endUtc,
      allDay: allDay ? 1 : 0,
      type,
      color,
      description: description.trim() || null,
      location: location.trim() || null,
      recurrence,
    }

    try {
      if (isEdit) {
        const res = await fetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          setErrors({ form: data.error ?? 'Failed to update' })
          return
        }
      } else {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          setErrors({ form: data.error ?? 'Failed to create event' })
          return
        }
      }

      // Revalidate all event queries
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/events'))
      onClose()
    } catch {
      setErrors({ form: 'Connection error' })
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-4 text-lg font-semibold">
        {isEdit ? 'Edit event' : 'New event'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.form && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {errors.form}
          </p>
        )}

        {/* Title */}
        <div>
          <label htmlFor="event-title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="event-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputClass}
            autoFocus
          />
          {errors.title && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>
          )}
        </div>

        {/* All Day */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            className="rounded"
          />
          All day
        </label>

        {/* Start / End */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="event-start" className="mb-1 block text-sm font-medium">
              Start
            </label>
            <input
              id="event-start"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? start.split('T')[0] : start}
              onChange={e => {
                const val = allDay ? `${e.target.value}T00:00` : e.target.value
                handleStartChange(val)
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="event-end" className="mb-1 block text-sm font-medium">
              End
            </label>
            <input
              id="event-end"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? end.split('T')[0] : end}
              onChange={e => {
                const val = allDay ? `${e.target.value}T23:59` : e.target.value
                setEnd(val)
              }}
              className={inputClass}
            />
            {errors.end && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.end}</p>
            )}
          </div>
        </div>

        {/* Type + Color */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="event-type" className="mb-1 block text-sm font-medium">
              Type
            </label>
            <select
              id="event-type"
              value={type}
              onChange={e => handleTypeChange(e.target.value)}
              className={inputClass}
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="event-color" className="mb-1 block text-sm font-medium">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="event-color"
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-input-border bg-input-bg"
              />
              <span className="text-xs text-text-muted">{color}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="event-description" className="mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="event-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="event-location" className="mb-1 block text-sm font-medium">
            Location
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Recurrence */}
        <div>
          <label htmlFor="event-recurrence" className="mb-1 block text-sm font-medium">
            Recurrence
          </label>
          <select
            id="event-recurrence"
            value={recurrence}
            onChange={e => setRecurrence(e.target.value)}
            className={inputClass}
          >
            {RECURRENCE_OPTIONS.map(r => (
              <option key={r} value={r}>
                {RECURRENCE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
