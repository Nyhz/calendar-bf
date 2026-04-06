'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'calendar-dark-mode'

export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const prefersDark = stored !== null
      ? stored === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches

    setIsDark(prefersDark)
    document.documentElement.classList.toggle('dark', prefersDark)
  }, [])

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
