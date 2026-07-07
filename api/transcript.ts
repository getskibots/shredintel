/**
 * GET/POST /api/transcript?botId=&cid=  — the drill-down endpoint.
 * Returns the cleaned message thread for ONE conversation, scoped to the bot
 * (a resort can only read its own conversations) and PII-scrubbed. Reads
 * raw.admin_chat_history server-side (the anon key can't touch raw.*), so the
 * transcript never leaves through the browser's public key.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'

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

const prettyUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
const fileName = (u: string) => decodeURIComponent(u.split('?')[0].split('/').pop() || u)

// Deep-link a Text Edit back to the resort's own admin so a weak answer can be
// fixed at the source. The edit opens in a client-side modal (no per-edit route),
// so we link to the text-edits list pre-filtered by the edit's title via ?search=.
// If the admin ignores the param the link still lands on the right page — and the
// badge names the exact edit — so it degrades gracefully either way.
const textEditUrl = (botId: number, name?: string) => {
  const base = `https://bots.getskitickets.com/admin/bot/${botId}/knowledge/text-edits`
  return name ? `${base}?search=${encodeURIComponent(name)}` : base
}

/** Map a matched admin_knowledge_reply row → the resort's Knowledge Layer + a
 *  clickable/labelled source. Undefined for non-knowledge bot turns (greetings,
 *  buttons) and guest turns (no matched row). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSource(r: any, botId: number): { layer: string; url?: string; label?: string } | undefined {
  if (!r.matched) return undefined
  if (r.is_failed) return { layer: 'Failed' }
  const st = r.source_type as string | null
  const val = (r.source_value as string | null) || ''
  if (st === 'WEBSITE') return { layer: 'Website', url: val || undefined, label: val ? prettyUrl(val) : undefined }
  if (st === 'FILE') return { layer: 'Files', url: val || undefined, label: val ? fileName(val) : undefined }
  if (st === 'TEXT') {
    // source_name = the edit's title (e.g. "change date on reservation"); it's
    // the human-searchable handle and what we already show in the badge.
    const name = (r.source_name as string | null)?.trim() || undefined
    return { layer: 'Text Edits', label: name, url: textEditUrl(botId, name) }
  }
  return { layer: 'Instructions' } // matched reply, no retrieved source = prompt-only
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

      // Attach the knowledge SOURCE to each bot answer. admin_knowledge_reply is
      // keyed by (admin_conversation.user_id, sent_at) — NOT admin_chat_history's
      // user_id (that's a platform id). The bot answer's `timestamp` equals the
      // reply's `sent_at`. `matched` distinguishes a real knowledge answer (even a
      // null-source "Instructions" one) from a greeting/button with no reply row.
      const msgs = await client.query(
        `select case when coalesce(h.is_from_support,0)=1 then 'support'
                     when coalesce(h.is_echo,false) then 'bot' else 'user' end as sender,
                h.formatted_chat_history #>> '{}' as fch,
                h.message #>> '{}' as msg,
                kr.source_type, kr.source_value, kr.source_name, kr.is_failed, kr.matched
           from raw.admin_chat_history h
           left join lateral (
             select source_type, source_value, source_name, is_failed, true as matched
               from raw.admin_knowledge_reply kr
              where kr.user_id = (select cv.user_id from raw.admin_conversation cv where cv.id = $1)
                and kr.sent_at = h."timestamp"
              limit 1
           ) kr on true
          where h.conversation_id = $1 and h.is_message = 1 and coalesce(h.visible,1) = 1
          order by h."timestamp"`,
        [cid],
      )
      // The Botscrew support tab is keyed by MESSAGE id (admin_chat_history.id),
      // not conversation_id — the "support number" is the conversation's first
      // message. Return it so the drill can deep-link correctly.
      const firstMsg = await client.query(
        `select min(id)::text as sid from raw.admin_chat_history where conversation_id = $1`,
        [cid],
      )
      await client.query('rollback')

      const messages = msgs.rows
        .map((r) => {
          const source = buildSource(r, botId)
          return {
            sender: r.sender as string,
            text: scrub((pickText(r.fch) || pickText(r.msg)).replace(/\s+/g, ' ').trim()),
            ...(source ? { source } : {}),
          }
        })
        .filter((m) => m.text)

      const supportId = firstMsg.rows[0]?.sid ?? null
      return res.status(200).json({ conversationId: cid, meta: meta.rows[0], messages, supportId })
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
