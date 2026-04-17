import { NextRequest, NextResponse } from 'next/server'
import { getAllSettings, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = new Set(['theme', 'default_view', 'daily_summary_time'])

export async function GET() {
  try {
    const data = await getAllSettings()
    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
    }
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) {
        return NextResponse.json({ error: `Unknown setting: ${k}` }, { status: 400 })
      }
      if (typeof v !== 'string') {
        return NextResponse.json({ error: `${k} must be a string` }, { status: 400 })
      }
      await setSetting(k, v)
    }
    return NextResponse.json({ data: await getAllSettings() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
