'use client'

import { type ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { CalendarDragData } from '@/lib/dnd'

type DraggableEventProps = {
  eventId: number
  start: string
  end: string
  allDay: boolean
  sourceView: 'month' | 'week' | 'day'
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function DraggableEvent({
  eventId,
  start,
  end,
  allDay,
  sourceView,
  children,
  className,
  style,
}: DraggableEventProps) {
  const dragData: CalendarDragData = {
    eventId,
    originalStart: start,
    originalEnd: end,
    allDay,
    sourceView,
  }

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event-${eventId}`,
    data: dragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${className ?? ''} ${isDragging ? 'opacity-50' : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
