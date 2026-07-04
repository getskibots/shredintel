/**
 * GET/POST /api/transcript?botId=&cid=  — the drill-down endpoint.
 * Returns the cleaned message thread for ONE conversation, scoped to the bot
 * (a resort can only read its own conversations) and PII-scrubbed. Reads
 * raw.admin_chat_history server-side (the anon key can't touch raw.*), so the
 * transcript never leaves through the browser's public key.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import pg from 'pg'

let pool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (pool) return pool
  const cfg = process.env.SHREDINTEL_DB_URL
    ? { connectionString: process.env.SHREDINTEL_DB_URL }
    : {
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        user: process.env.SUPABASE_DB_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        database: process.env.SUPABASE_DB_NAME || 'postgres',
      }
  pool = new pg.Pool({ ...cfg, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10_000 })
  return pool
}

const scrub = (s: string) =>
  (s || '')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')

// Bot turns are stored as a structured message object ({text, texts:[{values}],
// atomId, buttons, …}); guest turns are plain strings. Pull the human-readable
// text out of whatever shape we get, tolerating double-encoded JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textFromObj(o: any): string {
  if (o == null) return ''
  if (typeof o === 'string') return o
  if (Array.isArray(o)) return o.map(textFromObj).filter(Boolean).join(' ')
  if (typeof o === 'object') {
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim()
    if (Array.isArray(o.texts)) {
      const vals = o.texts
        .flatMap((t: { values?: unknown }) => (Array.isArray(t?.values) ? t.values : []))
        .filter((v: unknown) => typeof v === 'string')
      if (vals.length) return vals.join(' ')
    }
    if (typeof o.message === 'string') return o.message
  }
  return ''
}

function pickText(raw: unknown): string {
  if (raw == null) return ''
  let s = String(raw).trim()
  if (!s) return ''
  for (let i = 0; i < 2; i++) {
    if (!(s.startsWith('{') || s.startsWith('[') || (s.startsWith('"') && s.endsWith('"')))) break
    try {
      const parsed = JSON.parse(s)
      const t = textFromObj(parsed)
      if (t) return t
      if (typeof parsed === 'string') { s = parsed; continue } // double-encoded → re-parse
      return ''
    } catch {
      break
    }
  }
  return s
}

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

      // bot-scoping: the conversation must be an enriched conversation for THIS bot
      const meta = await client.query(
        `select section, pinchpoint, sentiment, urgency, handover, topic, day
           from report.conversation_intel where conversation_id = $1 and bot_id = $2`,
        [cid, botId],
      )
      if (meta.rowCount === 0) {
        await client.query('rollback')
        return res.status(404).json({ error: 'conversation not found for this bot' })
      }

      const msgs = await client.query(
        `select case when coalesce(h.is_from_support,0)=1 then 'support'
                     when coalesce(h.is_echo,false) then 'bot' else 'user' end as sender,
                h.formatted_chat_history #>> '{}' as fch,
                h.message #>> '{}' as msg
           from raw.admin_chat_history h
          where h.conversation_id = $1 and h.is_message = 1 and coalesce(h.visible,1) = 1
          order by h."timestamp"`,
        [cid],
      )
      await client.query('rollback')

      const messages = msgs.rows
        .map((r) => ({
          sender: r.sender as string,
          text: scrub((pickText(r.fch) || pickText(r.msg)).replace(/\s+/g, ' ').trim()),
        }))
        .filter((m) => m.text)

      return res.status(200).json({ conversationId: cid, meta: meta.rows[0], messages })
    } catch (e) {
      try { await client.query('rollback') } catch { /* noop */ }
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('[api/transcript] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
