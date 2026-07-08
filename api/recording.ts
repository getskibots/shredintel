/**
 * GET /api/recording?botId=&cid=  — stream ONE call's Twilio recording.
 *
 * Bot-scoped (a resort can only fetch its own calls' audio) + the Twilio
 * credentials never leave the server: we look up the recording_sid for THIS
 * bot's conversation, fetch the mp3 from Twilio with server-side Basic auth,
 * and stream it back. The client only ever talks to this endpoint — it never
 * sees the Account SID / Auth Token or a raw Twilio URL.
 *
 * Config (Vercel env, server-only): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 * NOTE: voice bots span two Twilio accounts — this uses the single account in
 * env (bot 248 = AC9271…). A per-bot account map is the follow-up for the
 * 461-495 fleet on the other account.
 *
 * PII: recordings are guest-voice PII → same bot-scoped, authed-proxy posture
 * as /api/transcript (recordings are never anon-readable).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'

export const maxDuration = 30

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const botId = Number(req.query.botId)
    const cid = Number(req.query.cid)
    if (!botId || !cid) return res.status(400).json({ error: 'botId and cid are required' })

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!accountSid || !authToken) {
      return res.status(503).json({ error: 'recording playback not configured (missing Twilio credentials)' })
    }

    // bot-scoping: the recording_sid must belong to a call for THIS bot.
    const client = await getPool().connect()
    let recordingSid: string | null = null
    try {
      await client.query('begin read only')
      await client.query("set local statement_timeout = '8000ms'")
      const r = await client.query(
        `select recording_sid from report.call_base
           where conversation_id = $1 and bot_id = $2 and recording_sid is not null
           limit 1`,
        [cid, botId],
      )
      recordingSid = (r.rows[0]?.recording_sid as string | undefined) ?? null
      await client.query('rollback')
    } finally {
      client.release()
    }

    if (!recordingSid) return res.status(404).json({ error: 'no recording for this call' })

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const tw = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
    if (!tw.ok) return res.status(502).json({ error: `twilio recording fetch failed (${tw.status})` })

    const buf = Buffer.from(await tw.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).send(buf)
  } catch (e) {
    console.error('[api/recording] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
