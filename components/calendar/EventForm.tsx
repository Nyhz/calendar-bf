'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useSWRConfig } from 'swr'
import {
  TacModal,
  TacModalContent,
  TacModalHeader,
  TacModalTitle,
  TacModalFooter,
} from '@/components/ui/tac-modal'
import { TacInput } from '@/components/ui/tac-input'
import { TacTextarea } from '@/components/ui/tac-textarea'
import {
  TacSelect,
  TacSelectTrigger,
  TacSelectContent,
  TacSelectItem,
  TacSelectValue,
} from '@/components/ui/tac-select'
import { TacButton } from '@/components/ui/tac-button'
import { cn } from '@/components/ui/utils'
import { TYPE_COLORS } from '@/lib/db/schema'
import type { Event } from '@/lib/db/schema'

const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Europe/Madrid'

const EVENT_TYPES = ['event', 'meeting', 'birthday', 'reminder'] as const
const EVENT_TYPE_LABELS: Record<string, string> = {
  event: 'Evento',
  meeting: 'Reunión',
  birthday: 'Cumpleaños',
  reminder: 'Recordatorio',
}
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const

const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Sin repetición',
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
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

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  )
  return (asUtc - utcMs) / 60_000
}

// Interpret a "YYYY-MM-DDTHH:MM" string as wall-clock time in TIMEZONE
// and return the corresponding UTC ISO — independent of the browser's timezone.
function localInputToUtc(localValue: string): string {
  const [datePart, timePart = '00:00'] = localValue.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetMin = tzOffsetMinutes(guess, TIMEZONE)
  return new Date(guess - offsetMin * 60_000).toISOString()
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

const dateInputClass = cn(
  'w-full bg-dr-bg border border-dr-border text-dr-text font-data text-sm',
  'px-3 py-2.5 min-h-[44px]',
  'focus:border-dr-amber focus:outline-none',
  '[color-scheme:dark]',
)

const labelClass = 'mb-1 block text-xs font-tactical uppercase tracking-widest text-dr-secondary'

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
    if (newType === 'birthday') {
      setRecurrence('yearly')
      setAllDay(true)
    }
    if (newType === 'reminder') {
      setAllDay(false)
      setEnd(start)
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
    if (!title.trim()) errs.title = 'El título es obligatorio'
    if (!allDay && type !== 'reminder' && start && end && new Date(end) <= new Date(start)) {
      errs.end = 'La hora de fin debe ser posterior a la de inicio'
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
      const startDate = start.split('T')[0]
      const endDate = end.split('T')[0] || startDate
      startUtc = `${startDate}T00:00:00Z`
      endUtc = `${endDate}T23:59:59Z`
    } else {
      startUtc = localInputToUtc(start)
      endUtc = type === 'reminder' ? startUtc : localInputToUtc(end)
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
          setErrors({ form: data.error ?? 'Error al actualizar' })
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
          setErrors({ form: data.error ?? 'Error al crear el evento' })
          return
        }
      }

      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/events'))
      onClose()
    } catch {
      setErrors({ form: 'Error de conexión' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TacModal open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <TacModalContent showCloseButton={false} className="sm:max-w-lg">
        <TacModalHeader>
          <TacModalTitle>
            {isEdit ? 'EDITAR EVENTO' : 'CREAR EVENTO'}
          </TacModalTitle>
        </TacModalHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-2">
          {errors.form && (
            <p className="border border-dr-red/30 bg-dr-red/10 px-3 py-2 text-sm font-tactical text-dr-red">
              {errors.form}
            </p>
          )}

          {/* Title */}
          <div>
            <label htmlFor="event-title" className={labelClass}>
              Título
            </label>
            <TacInput
              id="event-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título del evento..."
              autoFocus
            />
            {errors.title && (
              <p className="mt-1 text-xs font-tactical text-dr-red">{errors.title}</p>
            )}
          </div>

          {/* All Day — hidden for reminders (reminders always have a specific time) */}
          {type !== 'reminder' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-tactical uppercase tracking-wider text-dr-secondary">
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                className="size-4 cursor-pointer appearance-none border border-dr-border bg-dr-bg checked:border-dr-green checked:bg-dr-green"
              />
              Todo el día
            </label>
          )}

          {/* Start / End */}
          <div className={type === 'reminder' ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
              <label htmlFor="event-start" className={labelClass}>
                {type === 'reminder' ? 'Cuándo' : 'Inicio'}
              </label>
              <input
                id="event-start"
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? start.split('T')[0] : start}
                onChange={e => {
                  const val = allDay ? `${e.target.value}T00:00` : e.target.value
                  handleStartChange(val)
                }}
                className={dateInputClass}
              />
            </div>
            {type !== 'reminder' && (
              <div>
                <label htmlFor="event-end" className={labelClass}>
                  Fin
                </label>
                <input
                  id="event-end"
                  type={allDay ? 'date' : 'datetime-local'}
                  value={allDay ? end.split('T')[0] : end}
                  onChange={e => {
                    const val = allDay ? `${e.target.value}T23:59` : e.target.value
                    setEnd(val)
                  }}
                  className={dateInputClass}
                />
                {errors.end && (
                  <p className="mt-1 text-xs font-tactical text-dr-red">{errors.end}</p>
                )}
              </div>
            )}
          </div>

          {/* Type + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Tipo
              </label>
              <TacSelect value={type} onValueChange={(v) => { if (v) handleTypeChange(v) }}>
                <TacSelectTrigger className="w-full">
                  <TacSelectValue />
                </TacSelectTrigger>
                <TacSelectContent>
                  {EVENT_TYPES.map(t => (
                    <TacSelectItem key={t} value={t}>
                      <span
                        className="mr-1.5 inline-block size-2.5"
                        style={{ backgroundColor: TYPE_COLORS[t] }}
                      />
                      {EVENT_TYPE_LABELS[t]}
                    </TacSelectItem>
                  ))}
                </TacSelectContent>
              </TacSelect>
            </div>
            <div>
              <label htmlFor="event-color" className={labelClass}>
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="event-color"
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="h-[44px] w-14 cursor-pointer border border-dr-border bg-dr-bg p-1"
                />
                <span className="font-data text-xs text-dr-muted">{color}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="event-description" className={labelClass}>
              Descripción
            </label>
            <TacTextarea
              id="event-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Descripción del evento..."
            />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="event-location" className={labelClass}>
              Ubicación
            </label>
            <TacInput
              id="event-location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Ubicación..."
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className={labelClass}>
              Repetición
            </label>
            <TacSelect value={recurrence} onValueChange={(v) => { if (v) setRecurrence(v) }}>
              <TacSelectTrigger className="w-full">
                <TacSelectValue />
              </TacSelectTrigger>
              <TacSelectContent>
                {RECURRENCE_OPTIONS.map(r => (
                  <TacSelectItem key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </TacSelectItem>
                ))}
              </TacSelectContent>
            </TacSelect>
          </div>
        </form>

        {/* Actions */}
        <TacModalFooter>
          <TacButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancelar
          </TacButton>
          <TacButton
            type="submit"
            variant="success"
            size="sm"
            disabled={submitting}
            onClick={(e) => {
              // Trigger form submission via the form element
              const form = (e.currentTarget as HTMLElement).closest('[data-slot="dialog-content"]')?.querySelector('form')
              if (form) {
                form.requestSubmit()
              }
            }}
          >
            {submitting ? 'Guardando...' : isEdit ? 'GUARDAR' : 'CREAR'}
          </TacButton>
        </TacModalFooter>
      </TacModalContent>
    </TacModal>
  )
}
