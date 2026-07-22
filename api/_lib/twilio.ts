/**
 * Account-aware Twilio credential resolution (multi-account ready).
 *
 *   bot_id → account_sid   from report.bot_twilio (GSB-internal config table)
 *   account_sid → token    from env: TWILIO_ACCOUNTS json map ({"AC..":"token"})
 *                          for multi-account, or the single TWILIO_ACCOUNT_SID /
 *                          TWILIO_AUTH_TOKEN today.
 *
 * Falls back to the single-account env when a bot has no config row yet (248's
 * current setup). The token never leaves the server. (Encrypted-in-DB tokens +
 * the admin console are the finalization step; this is the env-token phase.)
 */
import type { Pool } from 'pg'
import { decryptToken } from './tokenCrypto.js'

export function twilioTokenFor(accountSid: string): string | null {
  const map = (process.env.TWILIO_ACCOUNTS || '').trim()
  if (map) {
    try {
      const j = JSON.parse(map) as Record<string, string>
      if (j[accountSid]) return j[accountSid]
    } catch {
      /* malformed TWILIO_ACCOUNTS json — fall through */
    }
    return null
  }
  // single-account fallback (today)
  return (process.env.TWILIO_AUTH_TOKEN || '').trim() || null
}

export async function resolveTwilio(
  pool: Pool,
  botId: number,
): Promise<{ accountSid: string; token: string } | null> {
  let accountSid: string | null = null
  let encToken: string | null = null
  try {
    const r = await pool.query('select account_sid, auth_token_enc from report.bot_twilio where bot_id = $1', [botId])
    accountSid = (r.rows[0]?.account_sid as string | undefined) ?? null
    encToken = (r.rows[0]?.auth_token_enc as string | undefined) ?? null
  } catch {
    /* bot_twilio / the column may not exist yet — fall back to single-account env */
  }
  if (!accountSid) accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim() || null
  if (!accountSid) return null
  // Prefer a dashboard-entered token (encrypted in the DB); fall back to env.
  const token = decryptToken(encToken) ?? twilioTokenFor(accountSid)
  if (!token) return null
  return { accountSid, token }
}
