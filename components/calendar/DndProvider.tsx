'use client'

import { type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { computeNewTimes, type CalendarDragData, type CalendarDropData } from '@/lib/dnd'

type DndProviderProps = {
  onEventMove: (eventId: number, newStart: string, newEnd: string) => Promise<void>
  onEventResize: (eventId: number, newEnd: string) => Promise<void>
  children: ReactNode
}

export default function DndProvider({ onEventMove, onEventResize: _onEventResize, children }: DndProviderProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { distance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const dragData = active.data.current as CalendarDragData | undefined
    const dropData = over.data.current as CalendarDropData | undefined
    if (!dragData || !dropData) return

    const { start, end } = computeNewTimes(dragData, dropData)
    onEventMove(dragData.eventId, start, end)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  )
}
