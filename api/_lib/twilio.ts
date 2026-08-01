/**
 * Account-aware Twilio credential resolution (multi-account, zero per-bot config).
 *
 * PRIMARY: the Botscrew mirror already holds EVERY voice bot's account + token
 *   bot_id → raw.admin_bot.twilio_configs_id → raw.admin_twilio_configs
 *            (accountsid + auth_token)
 * — the same source the cost sync and the transfer ingest use — so /api/recording
 * works for every voice bot with nothing to seed. GSB owns these Twilio accounts.
 *
 * FALLBACK (kept for safety): report.bot_twilio (account_sid) + a token from an
 * encrypted DB column or env (TWILIO_ACCOUNTS json map, or single TWILIO_ACCOUNT_SID
 * / TWILIO_AUTH_TOKEN). The token never leaves the server.
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
  // PRIMARY: resolve account + token straight from the mirror — complete for the
  // whole voice fleet, no bot_twilio seeding or env token needed.
  try {
    const m = await pool.query(
      `select t.accountsid, t.auth_token
         from raw.admin_bot b
         join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
        where b.id = $1 and coalesce(t.accountsid, '') <> '' and coalesce(t.auth_token, '') <> ''
        limit 1`,
      [botId],
    )
    const sid = (m.rows[0]?.accountsid as string | undefined)?.trim()
    const tok = (m.rows[0]?.auth_token as string | undefined)?.trim()
    if (sid && tok) return { accountSid: sid, token: tok }
  } catch {
    /* mirror not reachable — fall through to the config table / env */
  }

  // FALLBACK: report.bot_twilio (account) + encrypted-DB or env token.
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
