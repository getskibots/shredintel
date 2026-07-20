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

/**
 * Coverage floor, as a fraction of the trailing baseline.
 *
 * Recency alone is NOT enough. max(day) asks "does ANY enriched row exist
 * recently?", and enrich-fleet processes bots largest-first — so one row from
 * one bot makes the whole fleet look caught up. That produced a false green
 * mid-run on 2026-07-20. Coverage asks the real question: did a settled day get
 * enriched across roughly as many BOTS as usual?
 *
 * Measured on real data: healthy = 92% of baseline, mid-outage = 40-44%. The
 * baseline is a trailing median, so this self-calibrates as the fleet grows.
 */
const MIN_ENRICHMENT_COVERAGE = 0.6

interface Check {
  stage: string
  ok: boolean
  age: string
  detail?: string
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // NEVER let this response be cached. Vercel's default (`public, max-age=0,
  // must-revalidate`) permits a CDN to STORE it, and a cached 200 would mask a
  // real 503 — the monitor would sit green while the pipeline was broken, which
  // is precisely the blind spot this endpoint exists to close.
  // (UptimeRobot polls with HEAD, so the status code is the whole signal.)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')

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
      // Coverage: how many BOTS got enriched on a settled day, vs the trailing
      // median. current_date - 2 is safely past the nightly run, so a healthy
      // pipeline has fully covered it. ~80ms on 300k rows (indexed bot_id, day).
      const cov = await client.query<{ recent: number | null; baseline: string | null }>(`
        with per_day as (
          select day, count(distinct bot_id)::int bots
            from report.conversation_intel
           where day between current_date - 15 and current_date - 2
           group by day
        ), baseline as (
          select percentile_cont(0.5) within group (order by bots)::numeric med
            from per_day where day <= current_date - 5
        )
        select (select bots from per_day where day = current_date - 2) as recent,
               (select med from baseline)                             as baseline`)

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
        stage: 'enrichment_recency',
        ok: enrLag <= MAX_ENRICHMENT_LAG_DAYS,
        age: Number.isFinite(enrLag) ? `${enrLag}d behind` : 'never',
        detail: `threshold ${MAX_ENRICHMENT_LAG_DAYS}d`,
      })

      // Catches the partial/in-progress case that recency alone misses.
      const recentBots = Number(cov.rows[0]?.recent ?? 0)
      const baselineBots = Number(cov.rows[0]?.baseline ?? 0)
      // No baseline yet (fresh DB) → don't cry wolf.
      const ratio = baselineBots > 0 ? recentBots / baselineBots : 1
      checks.push({
        stage: 'enrichment_coverage',
        ok: ratio >= MIN_ENRICHMENT_COVERAGE,
        age: `${Math.round(ratio * 100)}% of baseline (${recentBots}/${baselineBots} bots)`,
        detail: `threshold ${Math.round(MIN_ENRICHMENT_COVERAGE * 100)}%`,
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
