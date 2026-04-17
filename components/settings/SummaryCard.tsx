'use client'
import useSWR from 'swr'
import { useState } from 'react'

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Record<string, string>)

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default function SummaryCard() {
  const { data, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)
  const [saving, setSaving] = useState(false)
  const [regen, setRegen] = useState(false)

  const time = data?.daily_summary_time ?? '08:00'

  async function saveTime(value: string) {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ daily_summary_time: value }),
      })
      await mutate()
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setRegen(true)
    try {
      await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: todayMadrid() }),
      })
    } finally {
      setRegen(false)
    }
  }

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Daily summary</h2>
      <label className="flex items-center gap-2 text-sm">
        Time of day (Europe/Madrid):
        <input
          type="time"
          value={time}
          onChange={e => saveTime(e.target.value)}
          disabled={saving}
          className="border rounded px-2 py-1"
        />
      </label>
      <button onClick={regenerate} disabled={regen} className="px-3 py-1 rounded border text-sm">
        {regen ? 'Regenerating…' : "Regenerate today's summary"}
      </button>
    </section>
  )
}
