'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { X, MapPin, Repeat } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacButton } from '@/components/ui/tac-button'
import { cn } from '@/components/ui/utils'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
  yearly: 'Repeats yearly',
}

const EVENT_TYPE_BADGE_COLOR: Record<string, string> = {
  event: 'text-dr-blue',
  meeting: 'text-dr-green',
  birthday: 'text-dr-teal',
  reminder: 'text-dr-amber',
  holiday: 'text-dr-red',
}

type EventPopoverProps = {
  event: Event | null
  onClose: () => void
  onEdit: (event: Event) => void
}

function formatDateRange(start: string, end: string, allDay: number): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
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

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const timeFmt = new Intl.DateTimeFormat('en-US', {
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
  const badgeColorClass = EVENT_TYPE_BADGE_COLOR[event.type] ?? 'text-dr-dim'

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
      {/* Close button */}
      <div className="flex justify-end -mt-2 -mr-2">
        <button
          onClick={onClose}
          className="p-1.5 text-dr-muted hover:text-dr-text transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Color accent bar */}
      <div
        className="h-1 w-full mb-4"
        style={{ backgroundColor: event.color }}
      />

      {/* Title with left border accent */}
      <div
        className="border-l-3 pl-3 mb-4"
        style={{ borderColor: event.color }}
      >
        <h2 className="font-tactical text-lg uppercase tracking-wider text-dr-text">
          {event.title}
        </h2>
      </div>

      {/* Type badge */}
      <div className="mb-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-tactical text-xs tracking-wider',
            badgeColorClass,
          )}
        >
          <span aria-hidden="true">&bull;</span>
          {event.type.toUpperCase()}
        </span>

        {event.allDay === 1 && (
          <span className="ml-2 inline-flex items-center font-tactical text-xs tracking-wider text-dr-dim">
            <span aria-hidden="true">&bull;</span>
            <span className="ml-1.5">ALL DAY</span>
          </span>
        )}
      </div>

      {/* Date/Time */}
      <p className="font-data text-sm text-dr-secondary mb-3">
        {formatDateRange(event.start, event.end, event.allDay)}
      </p>

      {/* Location */}
      {event.location && (
        <div className="flex items-start gap-2 text-sm mb-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-dr-muted" />
          <span className="font-data text-dr-text">{event.location}</span>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <p className="whitespace-pre-wrap font-data text-sm text-dr-secondary mb-3">
          {event.description}
        </p>
      )}

      {/* Recurrence */}
      {event.recurrence && event.recurrence !== 'none' && (
        <div className="flex items-center gap-2 text-sm text-dr-muted mb-3">
          <Repeat className="h-4 w-4 shrink-0" />
          <span className="font-data">{RECURRENCE_LABELS[event.recurrence] ?? event.recurrence}</span>
        </div>
      )}

      {/* Actions */}
      {!isHoliday && (
        <div className="mt-4 flex justify-end gap-2 border-t border-dr-border pt-4">
          {confirming ? (
            <>
              <span className="self-center font-tactical text-xs tracking-wider text-dr-red uppercase">
                Confirm deletion?
              </span>
              <TacButton
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                No
              </TacButton>
              <TacButton
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </TacButton>
            </>
          ) : (
            <>
              <TacButton
                variant="danger"
                size="sm"
                onClick={handleDelete}
              >
                Delete
              </TacButton>
              <TacButton
                variant="success"
                size="sm"
                onClick={() => onEdit(event!)}
              >
                Edit
              </TacButton>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
