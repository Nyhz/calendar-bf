'use client'

import { type ReactNode, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { computeNewTimes, type CalendarDragData, type CalendarDropData } from '@/lib/dnd'

type DndProviderProps = {
  onEventMove: (eventId: number, newStart: string, newEnd: string) => Promise<void>
  onEventResize: (eventId: number, newEnd: string) => Promise<void>
  children: ReactNode
}

export default function DndProvider({ onEventMove, onEventResize: _onEventResize, children }: DndProviderProps) {
  const [activeDrag, setActiveDrag] = useState<CalendarDragData | null>(null)

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { distance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  function handleDragStart(event: DragStartEvent) {
    const dragData = event.active.data.current as CalendarDragData | undefined
    setActiveDrag(dragData ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)

    const { active, over } = event
    if (!over) return

    const dragData = active.data.current as CalendarDragData | undefined
    const dropData = over.data.current as CalendarDropData | undefined
    if (!dragData || !dropData) return

    const { start, end } = computeNewTimes(dragData, dropData)
    onEventMove(dragData.eventId, start, end)
  }

  function handleDragCancel() {
    setActiveDrag(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div
            className="truncate border-l-[3px] px-1.5 font-mono text-xs leading-5 text-dr-text shadow-lg"
            style={{
              borderLeftColor: activeDrag.color,
              backgroundColor: `${activeDrag.color}1a`,
              maxWidth: 200,
            }}
          >
            {activeDrag.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
