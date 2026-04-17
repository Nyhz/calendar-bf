'use client'
import useSWR from 'swr'

const fetcher = (u: string) => fetch(u).then(r => r.json()).then(j => j.data as Record<string, string>)

export default function AppearanceCard() {
  const { data, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)

  async function save(key: string, value: string) {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    await mutate()
  }

  const theme = data?.theme ?? 'system'
  const view = data?.default_view ?? 'month'

  return (
    <section className="p-4 border rounded space-y-3">
      <h2 className="text-lg font-medium">Appearance & defaults</h2>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Theme</legend>
        {(['light', 'dark', 'system'] as const).map(v => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="theme" checked={theme === v} onChange={() => save('theme', v)} />
            {v}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Default view</legend>
        {(['month', 'week', 'day', 'agenda'] as const).map(v => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="default_view" checked={view === v} onChange={() => save('default_view', v)} />
            {v}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
