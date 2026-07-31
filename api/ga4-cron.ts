/**
 * GET /api/ga4-cron — nightly GA4 pull for EVERY connected bot, run on Vercel
 * (scheduled in vercel.json → crons). Vercel already holds the OAuth client creds
 * + the encryption key, so the pull + token-decrypt happen here; nothing runs on
 * the droplet and no secret has to be copied anywhere.
 *
 * Auth: if CRON_SECRET is set, require Vercel's `Authorization: Bearer <secret>`
 * (Vercel injects it automatically on cron calls). Until then, a soft gate on the
 * `x-vercel-cron` header Vercel adds to scheduled invocations. The endpoint only
 * refreshes anon aggregate data for already-connected bots, so the interim soft
 * gate is low-risk; hardening = set CRON_SECRET (see the switch-later checklist).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { syncBotGA4 } from './_lib/ga4sync.js'

export const config = { maxDuration: 60 }

const CRON_SECRET = (process.env.CRON_SECRET || '').trim()
const NIGHTLY_DAYS = 30

function authed(req: VercelRequest): boolean {
  if (CRON_SECRET) return String(req.headers['authorization'] || '') === `Bearer ${CRON_SECRET}`
  return !!req.headers['x-vercel-cron']
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' })

  const pool = getPool()
  const started = Date.now()
  try {
    const { rows } = await pool.query(
      `select bot_id from report.bot_ga4
       where oauth_refresh_token_enc is not null and coalesce(status, 'connected') <> 'paused'
       order by bot_id`,
    )
    const results: Array<Record<string, unknown>> = []
    for (const { bot_id } of rows) {
      try {
        const r = await syncBotGA4(pool, bot_id, NIGHTLY_DAYS)
        results.push({ botId: bot_id, ok: true, days: r.days, pages: r.pages, sources: r.sources, events: r.events })
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : 'unknown error'
        await pool.query('update report.bot_ga4 set last_error = $2, updated_at = now() where bot_id = $1', [bot_id, msg]).catch(() => {})
        results.push({ botId: bot_id, ok: false, error: msg })
      }
    }
    const okCount = results.filter((r) => r.ok).length
    console.log(`[ga4-cron] ${okCount}/${rows.length} bots refreshed in ${Date.now() - started}ms`)
    return res.status(200).json({ ran: rows.length, ok: okCount, results })
  } catch (err) {
    console.error('[ga4-cron] failed:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' })
  }
}
