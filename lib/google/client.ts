// lib/google/client.ts
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { integrations, type Integration } from '@/lib/db/schema'

const REDIRECT_URI = 'http://localhost:3000/api/integrations/google/callback'
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
]

export function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set')
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export function buildConsentUrl(state: string): string {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })
}

export async function getIntegration(): Promise<Integration | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.provider, 'google'))
  return row ?? null
}

/**
 * Returns an authenticated OAuth2 client with a fresh access token.
 * Refreshes the token (and persists) if expired or within 60s of expiry.
 */
export async function getAuthedClient(): Promise<OAuth2Client> {
  const row = await getIntegration()
  if (!row) throw new Error('NOT_CONNECTED')

  const client = createOAuthClient()
  client.setCredentials({
    refresh_token: row.refreshToken,
    access_token: row.accessToken ?? undefined,
    expiry_date: row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : undefined,
  })

  const expiresAt = row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : 0
  if (!row.accessToken || Date.now() >= expiresAt - 60_000) {
    const { credentials } = await client.refreshAccessToken()
    await db
      .update(integrations)
      .set({
        accessToken: credentials.access_token ?? null,
        accessExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        refreshToken: credentials.refresh_token ?? row.refreshToken,
      })
      .where(eq(integrations.provider, 'google'))
    client.setCredentials(credentials)
  }

  return client
}

export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    const client = createOAuthClient()
    await client.revokeToken(refreshToken)
  } catch {
    // best-effort
  }
}
