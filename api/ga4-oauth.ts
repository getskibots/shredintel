/**
 * GET /api/ga4-oauth — the self-serve "Connect Google Analytics" OAuth flow.
 *
 *   ?botId=2                → 302 to Google's consent screen (start).
 *   ?code=…&state=…         → callback: exchange the code, encrypt+store the
 *                             resort's refresh token on report.bot_ga4, auto-pick
 *                             their property if there's exactly one, then bounce
 *                             back to /#/bot/:id?ga4=connected|pick.
 *   ?error=access_denied…   → user declined → /#/bot/:id?ga4=denied.
 *
 * The refresh token is AES-256-GCM (tokenCrypto / TWILIO_TOKEN_ENC_KEY) and lives
 * only in the server-only report.bot_ga4 table. The browser never sees it.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { encryptToken, tokenCryptoReady } from './_lib/tokenCrypto.js'
import { ga4OAuthReady, consentUrl, verifyState, exchangeCode, fetchEmail, listProperties } from './_lib/ga4.js'

const APP_BASE = (process.env.GA4_APP_BASE_URL || 'https://analytics.getskibots.com').trim()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ga4OAuthReady()) {
    return res.status(503).send('GA4 OAuth is not configured (set GA4_OAUTH_CLIENT_ID and GA4_OAUTH_CLIENT_SECRET).')
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const error = typeof req.query.error === 'string' ? req.query.error : ''

  // --- START: no code/error → send the resort to Google. ---
  if (!code && !error) {
    const botId = Number(req.query.botId)
    if (!botId) return res.status(400).send('botId required')
    res.setHeader('Location', consentUrl(botId))
    return res.status(302).end()
  }

  // --- CALLBACK ---
  const botId = state ? verifyState(state) : null
  const back = (flag: string) => {
    res.setHeader('Location', `${APP_BASE}/#/bot/${botId ?? ''}?ga4=${flag}`)
    return res.status(302).end()
  }

  if (error) return back('denied')
  if (!botId) return res.status(400).send('invalid or expired state')

  try {
    const tokens = await exchangeCode(code)
    const email = await fetchEmail(tokens.access_token)
    // List their properties so we can auto-select when there's only one.
    let properties: { propertyId: string }[] = []
    try { properties = await listProperties(tokens.access_token) } catch { /* picker will retry */ }
    const auto = properties.length === 1 ? properties[0].propertyId : null

    const pool = getPool()
    await pool.query(`create table if not exists report.bot_ga4 (
      bot_id int primary key, ga4_property_id text, label text,
      status text not null default 'connected', note text,
      connected_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      last_synced_at timestamptz, last_error text)`)
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_refresh_token_enc text')
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_email text')
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_connected_at timestamptz')

    // Base row + identity.
    await pool.query(
      `insert into report.bot_ga4 (bot_id, status, oauth_email, oauth_connected_at, updated_at)
       values ($1, 'connected', $2, now(), now())
       on conflict (bot_id) do update set
         status = 'connected', oauth_email = excluded.oauth_email,
         oauth_connected_at = now(), last_error = null, updated_at = now()`,
      [botId, email || null],
    )
    // Refresh token: Google only returns it on first consent (prompt=consent forces
    // it), so update only when present — a re-consent without one keeps the stored one.
    if (tokens.refresh_token && tokenCryptoReady()) {
      await pool.query(
        'update report.bot_ga4 set oauth_refresh_token_enc = $2, updated_at = now() where bot_id = $1',
        [botId, encryptToken(tokens.refresh_token)],
      )
    }
    if (auto) {
      await pool.query(
        'update report.bot_ga4 set ga4_property_id = $2, updated_at = now() where bot_id = $1',
        [botId, auto],
      )
    }
    return back(auto ? 'connected' : 'pick')
  } catch (e) {
    console.error('[api/ga4-oauth] callback failed:', e)
    return back('error')
  }
}
