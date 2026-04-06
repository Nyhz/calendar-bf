'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Modal } from '@/components/ui/Modal'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Se repite cada día',
  weekly: 'Se repite cada semana',
  monthly: 'Se repite cada mes',
  yearly: 'Se repite cada año',
}

type EventPopoverProps = {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
}

function formatDateRange(start: string, end: string, allDay: number): string {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  })

  const startDate = new Date(start)
  const endDate = new Date(end)

  if (allDay) {
    const startStr = fmt.format(startDate)
    const endStr = fmt.format(endDate)
    if (startStr === endStr) return startStr
    return `${startStr} – ${endStr}`
  }

  const dateFmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const timeFmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  })

  const startDateStr = dateFmt.format(startDate)
  const endDateStr = dateFmt.format(endDate)
  const startTime = timeFmt.format(startDate)
  const endTime = timeFmt.format(endDate)

  if (startDateStr === endDateStr) {
    return `${startDateStr}, ${startTime} – ${endTime}`
  }

  return `${startDateStr} ${startTime} – ${endDateStr} ${endTime}`
}

export function EventPopover({ event, onClose, onEdit }: EventPopoverProps) {
  const { mutate } = useSWRConfig()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!event) return null

  const isHoliday = event.type === 'holiday'

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/events/${event!.id}`, { method: 'DELETE' })
      if (res.ok) {
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/events'))
        onClose()
      }
    } catch {
      // Network error — silently fail, user can retry
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <Modal open={!!event} onClose={onClose} size="sm">
      {/* Color bar */}
      <div
        className="mb-4 h-2 rounded-full"
        style={{ backgroundColor: event.color }}
      />

      {/* Title */}
      <h2 className="text-xl font-bold">{event.title}</h2>

      {/* Date/Time */}
      <p className="mt-2 text-sm capitalize text-text-muted">
        {formatDateRange(event.start, event.end, event.allDay)}
      </p>

      {event.allDay === 1 && (
        <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          Todo el día
        </span>
      )}

      {/* Type badge */}
      <div className="mt-3">
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: event.color }}
        >
          {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
        </span>
      </div>

      {/* Location */}
      {event.location && (
        <div className="mt-3 flex items-start gap-2 text-sm">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{event.location}</span>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-muted">
          {event.description}
        </p>
      )}

      {/* Recurrence */}
      {event.recurrence && event.recurrence !== 'none' && (
        <p className="mt-3 text-sm text-text-muted">
          <svg className="mr-1 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {RECURRENCE_LABELS[event.recurrence] ?? event.recurrence}
        </p>
      )}

      {/* Actions */}
      {!isHoliday && (
        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          {confirming ? (
            <>
              <span className="self-center text-sm text-red-600 dark:text-red-400">
                Confirmar eliminación?
              </span>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-hover"
              >
                No
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Eliminar
              </button>
              <button
                onClick={() => onEdit(event!)}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
              >
                Editar
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
