'use client'

import { useEffect, useCallback, useRef } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function Modal({ open, onClose, children, size = 'md', className }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const widthClass = size === 'sm' ? 'max-w-md' : 'max-w-lg'

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${widthClass} max-h-[90vh] overflow-y-auto bg-dr-surface border border-dr-border p-6 shadow-2xl ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}
