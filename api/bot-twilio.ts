/**
 * GET/POST /api/bot-twilio — per-bot Twilio config (Account SID + inbound number).
 *
 * GET ?botId=252  → that one bot's current mapping (for the dashboard "Connect Twilio"
 *                   control). Returns { mapping: {...} | null }.
 * GET (no botId)  → every voice bot + its mapping ({ bots: [...] }) for a bulk view.
 * POST            → upsert one bot's mapping { bot_id, account_sid, phone_number?, label? }.
 *
 * NOT GATED for now (GSB-internal tool, whole app is behind the password gate; the
 * dashboard control is hidden inside the resort embed). Re-gating later is one block:
 * uncomment the GSB_ADMIN_KEY check below. The Account SID is semi-public; the auth
 * TOKEN never touches this table — it stays in server env keyed by account_sid.
 * report.bot_twilio is server-only (not anon-granted).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { encryptToken, tokenCryptoReady } from './_lib/tokenCrypto.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Optional gate (disabled). To re-enable, set GSB_ADMIN_KEY in env + uncomment:
  // const adminKey = (process.env.GSB_ADMIN_KEY || '').trim()
  // if (adminKey) {
  //   const provided = ((req.headers['x-gsb-admin-key'] as string) || '').trim()
  //   if (provided !== adminKey) return res.status(401).json({ error: 'unauthorized' })
  // }

  const pool = getPool()
  try {
    await pool.query(`create table if not exists report.bot_twilio (
      bot_id bigint primary key, account_sid text not null, phone_number text, label text,
      updated_at timestamptz not null default now())`)
    // Encrypted auth token (dashboard-entered, AES-256-GCM). Server-only column.
    await pool.query('alter table report.bot_twilio add column if not exists auth_token_enc text')

    if (req.method === 'GET') {
      const botId = Number(req.query.botId)
      if (botId) {
        // Single bot — what the dashboard "Connect Twilio" control reads. Works for
        // ANY bot_id (omni-channel: every bot can carry a voice channel), so this
        // does NOT depend on bot_channel classification.
        const { rows } = await pool.query(
          `select b.id as bot_id, b.name,
                  bt.account_sid, bt.phone_number, bt.label,
                  (bt.auth_token_enc is not null) as has_token
           from public.bots b
           left join report.bot_twilio bt on bt.bot_id = b.id
           where b.id = $1
           limit 1`,
          [botId],
        )
        return res.status(200).json({ mapping: rows[0] ?? null })
      }
      const { rows } = await pool.query(`
        select bc.bot_id, b.name, bc.voice_convs,
               bt.account_sid, bt.phone_number, bt.label,
               (bt.auth_token_enc is not null) as has_token
        from report.bot_channel bc
        left join public.bots b on b.id = bc.bot_id
        left join report.bot_twilio bt on bt.bot_id = bc.bot_id
        where bc.channel = 'voice'
        order by bc.voice_convs desc nulls last`)
      return res.status(200).json({ bots: rows })
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>
      const botId = Number(body.bot_id)
      const accountSid = String(body.account_sid ?? '').trim()
      if (!botId || !accountSid) return res.status(400).json({ error: 'bot_id and account_sid are required' })
      const phone = body.phone_number ? String(body.phone_number).trim() : null
      const label = body.label ? String(body.label).trim() : null
      await pool.query(
        `insert into report.bot_twilio (bot_id, account_sid, phone_number, label)
         values ($1, $2, $3, $4)
         on conflict (bot_id) do update set
           account_sid = excluded.account_sid, phone_number = excluded.phone_number,
           label = excluded.label, updated_at = now()`,
        [botId, accountSid, phone, label],
      )
      // Optional auth token: encrypt server-side, store ciphertext, never echo it back.
      // Absent/empty leaves any existing token untouched (so re-saving SID/number is safe).
      const rawToken = typeof body.auth_token === 'string' ? body.auth_token.trim() : ''
      if (rawToken) {
        if (!tokenCryptoReady()) {
          return res.status(503).json({ error: 'token storage is not configured on the server (set TWILIO_TOKEN_ENC_KEY); SID and number were saved' })
        }
        await pool.query(
          'update report.bot_twilio set auth_token_enc = $2, updated_at = now() where bot_id = $1',
          [botId, encryptToken(rawToken)],
        )
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('[api/bot-twilio] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
