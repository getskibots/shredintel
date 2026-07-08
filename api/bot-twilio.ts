/**
 * GET/POST /api/bot-twilio — GSB-INTERNAL Twilio config console API.
 *
 * GET  → every voice bot + its current bot_twilio mapping (account_sid, number).
 * POST → upsert one bot's mapping { bot_id, account_sid, phone_number?, label? }.
 *
 * Gated by GSB_ADMIN_KEY (x-gsb-admin-key header) — this is the access control that
 * keeps resorts out of the console regardless of the embed guard. The Account SID is
 * NOT a secret (semi-public); the auth TOKEN stays in env for now (encrypted-in-DB +
 * the key field = the Option-A finalization). report.bot_twilio is server-only.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminKey = (process.env.GSB_ADMIN_KEY || '').trim()
  const provided = ((req.headers['x-gsb-admin-key'] as string) || '').trim()
  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'unauthorized (GSB admin key required)' })
  }

  const pool = getPool()
  try {
    await pool.query(`create table if not exists report.bot_twilio (
      bot_id bigint primary key, account_sid text not null, phone_number text, label text,
      updated_at timestamptz not null default now())`)

    if (req.method === 'GET') {
      const { rows } = await pool.query(`
        select bc.bot_id, b.name, bc.voice_convs,
               bt.account_sid, bt.phone_number, bt.label
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
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('[api/bot-twilio] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
