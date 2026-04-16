'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'calendar-dark-mode'

export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== null
      ? stored === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return [isDark, toggle]
}
