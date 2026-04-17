// app/api/integrations/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { db } from '@/lib/db'
import { integrations, googleCalendars } from '@/lib/db/schema'
import { createOAuthClient, GOOGLE_SCOPES } from '@/lib/google/client'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const cookieState = req.cookies.get('google_oauth_state')?.value

    if (!code || !state || state !== cookieState) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
    }

    const client = createOAuthClient()
    const { tokens } = await client.getToken(code)
    if (!tokens.refresh_token) {
      return NextResponse.json({ error: 'No refresh token received — revoke app access at myaccount.google.com and retry' }, { status: 400 })
    }
    client.setCredentials(tokens)

    // Fetch email from id_token
    const idToken = tokens.id_token
    let email = 'unknown'
    if (idToken) {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf-8'))
      email = payload.email ?? 'unknown'
    }

    // Upsert integration
    await db
      .insert(integrations)
      .values({
        provider: 'google',
        accountEmail: email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        accessExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes: GOOGLE_SCOPES.join(' '),
      })
      .onConflictDoUpdate({
        target: integrations.provider,
        set: {
          accountEmail: email,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token ?? null,
          accessExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          scopes: GOOGLE_SCOPES.join(' '),
          connectedAt: new Date().toISOString(),
          lastSyncAt: null,
          lastSyncError: null,
        },
      })

    // Fetch calendar list
    const cal = google.calendar({ version: 'v3', auth: client })
    const list = await cal.calendarList.list()
    for (const item of list.data.items ?? []) {
      if (!item.id) continue
      await db
        .insert(googleCalendars)
        .values({
          id: item.id,
          summary: item.summary ?? item.id,
          backgroundColor: item.backgroundColor ?? null,
          enabled: 0,
        })
        .onConflictDoUpdate({
          target: googleCalendars.id,
          set: {
            summary: item.summary ?? item.id,
            backgroundColor: item.backgroundColor ?? null,
          },
        })
    }

    const res = NextResponse.redirect(new URL('/settings', req.url))
    res.cookies.delete('google_oauth_state')
    return res
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
