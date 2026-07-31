/**
 * GA4 OAuth + Data API helpers (self-serve "Connect Google Analytics").
 *
 * A resort clicks Connect on their bot's page, signs into Google, and grants us
 * read-only Analytics access. We store their REFRESH TOKEN (AES-256-GCM, same
 * tokenCrypto key as Twilio) in report.bot_ga4 — server-only — and use it nightly
 * to mint short-lived access tokens and pull aggregate reports.
 *
 * No extra npm deps: everything here is plain fetch against Google's REST
 * endpoints (OAuth token, userinfo, Admin accountSummaries, Data runReport).
 *
 * Env: GA4_OAUTH_CLIENT_ID, GA4_OAUTH_CLIENT_SECRET (from the GCP OAuth client),
 *      GA4_OAUTH_REDIRECT_URI (defaults to the prod callback), and for state
 *      signing GA4_OAUTH_STATE_SECRET (falls back to TWILIO_TOKEN_ENC_KEY).
 */
import { createHmac } from 'node:crypto'

// analytics.readonly covers BOTH Data API reads (runReport) and Admin reads
// (accountSummaries.list, to show the property picker). openid+email identify the
// connecting account so the UI can show "connected as x@resort.com".
const OAUTH_SCOPE = 'openid email https://www.googleapis.com/auth/analytics.readonly'

export interface OAuthCfg { clientId: string; clientSecret: string; redirectUri: string }

export function ga4OAuthConfig(): OAuthCfg {
  return {
    clientId: (process.env.GA4_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GA4_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.GA4_OAUTH_REDIRECT_URI || 'https://analytics.getskibots.com/api/ga4-oauth').trim(),
  }
}
export function ga4OAuthReady(): boolean {
  const c = ga4OAuthConfig()
  return !!(c.clientId && c.clientSecret)
}

// --- CSRF state: HMAC-signed {botId, ts}, valid 15 min. No new required secret. ---
function stateSecret(): string {
  return (process.env.GA4_OAUTH_STATE_SECRET || process.env.TWILIO_TOKEN_ENC_KEY || 'shredintel-ga4-state').trim()
}
export function signState(botId: number): string {
  const payload = `${botId}.${Date.now()}`
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}
export function verifyState(state: string): number | null {
  try {
    const [b64, sig] = String(state).split('.')
    if (!b64 || !sig) return null
    const payload = Buffer.from(b64, 'base64url').toString('utf8')
    const good = createHmac('sha256', stateSecret()).update(payload).digest('base64url')
    if (sig !== good) return null
    const [botId, ts] = payload.split('.')
    if (!ts || Date.now() - Number(ts) > 15 * 60 * 1000) return null
    return Number(botId) || null
  } catch { return null }
}

export function consentUrl(botId: number): string {
  const c = ga4OAuthConfig()
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    access_type: 'offline',          // we want a refresh token
    prompt: 'consent',               // force refresh_token even on re-consent
    include_granted_scopes: 'true',
    state: signState(botId),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

interface TokenResp { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string }

export async function exchangeCode(code: string): Promise<TokenResp> {
  const c = ga4OAuthConfig()
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: c.clientId, client_secret: c.clientSecret,
      redirect_uri: c.redirectUri, grant_type: 'authorization_code',
    }).toString(),
  })
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`)
  return r.json() as Promise<TokenResp>
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const c = ga4OAuthConfig()
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text()}`)
  const d = (await r.json()) as TokenResp
  return d.access_token
}

export async function fetchEmail(accessToken: string): Promise<string> {
  try {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) return ''
    const d = (await r.json()) as { email?: string }
    return d.email || ''
  } catch { return '' }
}

export interface GA4Property { propertyId: string; displayName: string; account: string }

/** Every GA4 property the connected account can read (for the picker). */
export async function listProperties(accessToken: string): Promise<GA4Property[]> {
  const out: GA4Property[] = []
  let pageToken = ''
  do {
    const url = `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!r.ok) throw new Error(`accountSummaries failed: ${r.status} ${await r.text()}`)
    const d = (await r.json()) as {
      accountSummaries?: { displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] }[]
      nextPageToken?: string
    }
    for (const acc of d.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        out.push({
          propertyId: String(p.property ?? '').replace('properties/', ''),
          displayName: p.displayName ?? '',
          account: acc.displayName ?? '',
        })
      }
    }
    pageToken = d.nextPageToken ?? ''
  } while (pageToken)
  return out
}

export interface GA4Row { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

/** runReport via REST with an OAuth bearer token (the connected resort's token). */
export async function runReportREST(
  accessToken: string, propertyId: string,
  body: Record<string, unknown>,
): Promise<GA4Row[]> {
  const id = String(propertyId).replace(/\D/g, '')
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`runReport failed: ${r.status} ${await r.text()}`)
  const d = (await r.json()) as { rows?: GA4Row[] }
  return d.rows ?? []
}
