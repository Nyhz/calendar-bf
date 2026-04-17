// app/api/integrations/google/authorize/route.ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { buildConsentUrl } from '@/lib/google/client'

export async function GET() {
  try {
    const state = randomBytes(16).toString('hex')
    const url = buildConsentUrl(state)
    const res = NextResponse.redirect(url)
    res.cookies.set('google_oauth_state', state, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600,
    })
    return res
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
