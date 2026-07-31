/**
 * POST /api/ga4-refresh { botId } — pull the last 28 days for ONE connected bot,
 * on demand, so the resort sees numbers the moment they finish connecting. The
 * recurring pull is /api/ga4-cron (nightly). Both share syncBotGA4.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { syncBotGA4 } from './_lib/ga4sync.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const botId = Number((req.body as Record<string, unknown>)?.botId)
  if (!botId) return res.status(400).json({ error: 'botId required' })

  const pool = getPool()
  try {
    const r = await syncBotGA4(pool, botId, 28)
    return res.status(200).json({ ok: true, days: r.days, pages: r.pages, sources: r.sources, events: r.events })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 400) : 'unknown error'
    await pool.query('update report.bot_ga4 set last_error = $2, updated_at = now() where bot_id = $1', [botId, msg]).catch(() => {})
    console.error('[api/ga4-refresh] failed:', err)
    return res.status(500).json({ error: msg })
  }
}
