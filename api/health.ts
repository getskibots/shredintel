/**
 * GET /api/health → 200 when the data pipeline is fresh, 503 when it isn't.
 *
 * WHY THIS EXISTS: on 2026-07-15 the nightly sync wedged on a single message
 * carrying a NUL byte (Postgres jsonb cannot store one), and messages stopped
 * mirroring for five days. Every uptime monitor stayed green the whole time,
 * because the site was serving fine — it was serving STALE data. An HTTP
 * monitor proves the server responds; only a freshness check proves the data
 * behind it is real.
 *
 * Point an UptimeRobot HTTP monitor at this URL. Non-2xx = down = alert.
 *
 * Deliberately returns no business data — just stage names and ages — so it is
 * safe to leave unauthenticated for the monitor to poll.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'

export const maxDuration = 10

/**
 * Thresholds are generous on purpose: the sync is nightly, so data is
 * legitimately ~24h old just before each run. These fire on a MISSED cycle,
 * not on normal operation.
 */
const MAX_MESSAGE_AGE_HOURS = 36      // sync ran within the last day and a half
const MAX_CONVERSATION_AGE_HOURS = 36
const MAX_ENRICHMENT_LAG_DAYS = 2     // tolerate one missed night, alert on two

interface Check {
  stage: string
  ok: boolean
  age: string
  detail?: string
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const checks: Check[] = []

  try {
    const client = await getPool().connect()
    try {
      // Keep a slow/locked DB from hanging the monitor — a timeout is itself a fail.
      await client.query("set local statement_timeout = '5000ms'")

      // NOTE: `order by id desc limit 1` rides the primary-key index, so this is
      // instant even on ~5.7M rows. `max(timestamp)` would seq-scan the table,
      // far too slow for an endpoint polled every minute.
      const msg = await client.query<{ ts: Date | null }>(
        `select "timestamp" as ts from raw.admin_chat_history order by id desc limit 1`,
      )
      const conv = await client.query<{ ts: Date | null }>(
        `select started_at as ts from raw.admin_conversation order by id desc limit 1`,
      )
      const enr = await client.query<{ lag: number | null }>(
        `select (current_date - max(day))::int as lag from report.conversation_intel`,
      )

      const hoursSince = (ts: Date | null | undefined) =>
        ts ? (Date.now() - new Date(ts).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY

      const msgAge = hoursSince(msg.rows[0]?.ts)
      const convAge = hoursSince(conv.rows[0]?.ts)
      const enrLag = enr.rows[0]?.lag ?? Number.POSITIVE_INFINITY

      checks.push({
        stage: 'messages_mirrored',
        ok: msgAge <= MAX_MESSAGE_AGE_HOURS,
        age: Number.isFinite(msgAge) ? `${msgAge.toFixed(1)}h` : 'never',
        detail: `threshold ${MAX_MESSAGE_AGE_HOURS}h`,
      })
      checks.push({
        stage: 'conversations_mirrored',
        ok: convAge <= MAX_CONVERSATION_AGE_HOURS,
        age: Number.isFinite(convAge) ? `${convAge.toFixed(1)}h` : 'never',
        detail: `threshold ${MAX_CONVERSATION_AGE_HOURS}h`,
      })
      checks.push({
        stage: 'enrichment',
        ok: enrLag <= MAX_ENRICHMENT_LAG_DAYS,
        age: Number.isFinite(enrLag) ? `${enrLag}d behind` : 'never',
        detail: `threshold ${MAX_ENRICHMENT_LAG_DAYS}d`,
      })
    } finally {
      client.release()
    }
  } catch (e) {
    // DB unreachable or query timed out — that is unhealthy too.
    return res.status(503).json({
      status: 'STALE',
      error: e instanceof Error ? e.message : 'database unreachable',
      checks,
    })
  }

  const failed = checks.filter((c) => !c.ok)
  const healthy = failed.length === 0

  // 503 so a plain HTTP monitor flags it DOWN. The word "STALE" is also in the
  // body if you would rather use a keyword monitor instead.
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'STALE',
    failing: failed.map((c) => c.stage),
    checks,
    checkedAt: new Date().toISOString(),
  })
}
