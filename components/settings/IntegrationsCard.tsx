'use client'
import useSWR from 'swr'
import { useState } from 'react'

type Calendar = { id: string, summary: string, backgroundColor: string | null, enabled: number }
type Status = {
  connected: boolean
  accountEmail?: string
  lastSyncAt?: string | null
  lastSyncError?: string | null
  calendars: Calendar[]
}

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Status)

export default function IntegrationsCard() {
  const { data, mutate } = useSWR<Status>('/api/integrations/google', fetcher)
  const [syncing, setSyncing] = useState(false)

  async function syncNow() {
    setSyncing(true)
    try {
      await fetch('/api/integrations/google/sync', { method: 'POST' })
      await mutate()
    } finally {
      setSyncing(false)
    }
  }

  async function toggleCalendar(id: string, enabled: boolean) {
    await fetch(`/api/integrations/google/calendars/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    await mutate()
  }

  async function disconnect() {
    if (!confirm('Disconnect and remove all synced Google events?')) return
    await fetch('/api/integrations/google', { method: 'DELETE' })
    await mutate()
  }

  if (!data) return <section className="p-4 border rounded">Loading…</section>

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Integrations</h2>
      <div>
        <h3 className="font-medium">Google Calendar</h3>
        {!data.connected ? (
          <div className="mt-2 space-y-1">
            <a href="/api/integrations/google/authorize" className="inline-block px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Connect Google Calendar</a>
            <p className="text-xs text-neutral-500">Open this page from the calendar host machine to complete sign-in.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <div>Connected as <strong>{data.accountEmail}</strong></div>
            <div className="text-neutral-500">
              {data.lastSyncAt ? `Last synced ${new Date(data.lastSyncAt).toLocaleString()}` : 'Not synced yet'}
            </div>
            {data.lastSyncError && (
              <div className="p-2 rounded bg-red-100 text-red-800">{data.lastSyncError}</div>
            )}
            <button onClick={syncNow} disabled={syncing} className="px-3 py-1 rounded border text-sm">
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <ul className="divide-y border rounded">
              {data.calendars.map(c => (
                <li key={c.id} className="flex items-center gap-2 p-2">
                  <input
                    type="checkbox"
                    checked={c.enabled === 1}
                    onChange={e => toggleCalendar(c.id, e.target.checked)}
                  />
                  <span className="inline-block w-3 h-3 rounded" style={{ background: c.backgroundColor ?? '#999' }} />
                  <span>{c.summary}</span>
                </li>
              ))}
            </ul>
            <button onClick={disconnect} className="text-sm text-red-600 underline">Disconnect</button>
          </div>
        )}
      </div>
      <TelegramStatus />
    </section>
  )
}

function TelegramStatus() {
  return (
    <div className="pt-3 border-t">
      <h3 className="font-medium">Telegram</h3>
      <p className="text-xs text-neutral-500 mt-1">
        Configured via environment variables. Edit <code>.env.local</code> and restart the server to change.
      </p>
    </div>
  )
}
