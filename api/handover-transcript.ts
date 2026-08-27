/**
 * GET/POST /api/handover-transcript?botId=&cid= — the Whisper transcript of the
 * HUMAN / escalation half of a transferred voice call (the portion the live
 * per-turn transcription never captures). Bot-scoped (a resort can only read its
 * own calls) + PII-scrubbed, read server-side from report.call_handover_transcript
 * (anon can't touch it — the table is service-role only).
 *
 * Returns { conversationId, handover: { text, isVoicemail, segmentSec, offsetSec } | null }.
 * handover is null when the call had no transfer/transcript (most non-escalated calls).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'

const scrub = (s: string) =>
  (s || '')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')

export const maxDuration = 15

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {}
    const botId = Number(req.query.botId ?? body.botId)
    const cid = Number(req.query.cid ?? body.cid)
    if (!botId || !cid) return res.status(400).json({ error: 'botId and cid are required' })

    const client = await getPool().connect()
    try {
      await client.query('begin read only')
      await client.query("set local statement_timeout = '8000ms'")
      // bot-scoping: the row must belong to a call for THIS bot.
      const r = await client.query(
        `select text, is_voicemail, segment_sec, offset_sec
           from report.call_handover_transcript
          where conversation_id = $1 and bot_id = $2 limit 1`,
        [cid, botId],
      )
      await client.query('rollback')
      const row = r.rows[0]
      const handover = row
        ? {
            text: scrub(String(row.text || '').replace(/\s+/g, ' ').trim()),
            isVoicemail: !!row.is_voicemail,
            segmentSec: row.segment_sec != null ? Number(row.segment_sec) : null,
            offsetSec: row.offset_sec != null ? Number(row.offset_sec) : null,
          }
        : null
      return res.status(200).json({ conversationId: cid, handover })
    } catch (e) {
      try { await client.query('rollback') } catch { /* noop */ }
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('[api/handover-transcript] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
