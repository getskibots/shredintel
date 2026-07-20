#!/usr/bin/env node
/**
 * heartbeat.mjs — the nightly pipeline's "did it ACTUALLY work?" gate.
 *
 * WHY THIS EXISTS: on 2026-07-15 sync.mjs died on a message containing a NUL
 * byte (Postgres jsonb can't store one). For five days the pipeline still
 * "completed" every night — nightly.sh is best-effort, so the other three
 * stages ran and reported success over incomplete data. Nothing alerted.
 *
 * Two failure modes have to be caught, and only one of them is a crash:
 *   1. a stage exited non-zero                → --failed tells us
 *   2. every stage "succeeded" but the data   → the freshness assertions below
 *      is stale (exactly what happened)
 *
 * Pings HEARTBEAT_URL only when BOTH are clean. Silence is the alert: point an
 * UptimeRobot heartbeat monitor at that URL and it fires when a ping is missed.
 *
 * Usage (from nightly.sh):  node heartbeat.mjs --failed "sync enrich-fleet"
 *   (empty/omitted --failed means every stage exited 0)
 */
import 'dotenv/config'
import pg from 'pg'

// Generous on purpose: the sync is nightly, so data is legitimately ~24h old
// right before a run. These fire on a MISSED cycle, not on normal operation.
const MAX_MESSAGE_AGE_HOURS = 36
const MAX_CONVERSATION_AGE_HOURS = 36
const MAX_ENRICHMENT_LAG_DAYS = 2

// Recency alone is NOT enough: max(day) asks "does ANY enriched row exist
// recently?", and enrich-fleet goes largest-bot-first, so ONE row can make the
// whole fleet look caught up (a real false green on 2026-07-20). Coverage asks
// whether a settled day was enriched across as many BOTS as usual.
// Measured: healthy 92% of baseline, mid-outage 40-44%.
const MIN_ENRICHMENT_COVERAGE = 0.6

const i = process.argv.indexOf('--failed')
const failedStages = (i > -1 ? String(process.argv[i + 1] || '') : '').trim()

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
})

const checks = []
try {
  await c.connect()
  // `order by id desc limit 1` rides the PK index — instant even on ~5.7M rows.
  // `max(timestamp)` would seq-scan the whole table.
  const msg = await c.query(`select "timestamp" as ts from raw.admin_chat_history order by id desc limit 1`)
  const conv = await c.query(`select started_at as ts from raw.admin_conversation order by id desc limit 1`)
  const enr = await c.query(`select (current_date - max(day))::int as lag from report.conversation_intel`)
  // Bots enriched on a settled day vs the trailing median (~80ms).
  const cov = await c.query(`
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

  // Mirrored MySQL datetimes carry a timezone skew: mysql2 reads a naive
  // DATETIME in the connection's local zone, so values can land ~6h in the
  // "future" once stored as timestamptz. Clamp at 0 — a future timestamp is
  // certainly not stale. Net effect: the alert fires ~6h later than the stated
  // limit, which is fine for a daily cadence. (The skew itself is a separate
  // data-correctness issue worth fixing at the sync layer.)
  const hoursSince = (ts) =>
    ts ? Math.max(0, (Date.now() - new Date(ts).getTime()) / 3_600_000) : Infinity
  const msgAge = hoursSince(msg.rows[0]?.ts)
  const convAge = hoursSince(conv.rows[0]?.ts)
  const enrLag = enr.rows[0]?.lag ?? Infinity

  checks.push({ name: 'messages', ok: msgAge <= MAX_MESSAGE_AGE_HOURS, got: `${msgAge.toFixed(1)}h old`, limit: `${MAX_MESSAGE_AGE_HOURS}h` })
  checks.push({ name: 'conversations', ok: convAge <= MAX_CONVERSATION_AGE_HOURS, got: `${convAge.toFixed(1)}h old`, limit: `${MAX_CONVERSATION_AGE_HOURS}h` })
  checks.push({ name: 'enrich recency', ok: enrLag <= MAX_ENRICHMENT_LAG_DAYS, got: `${enrLag}d behind`, limit: `${MAX_ENRICHMENT_LAG_DAYS}d` })

  const recentBots = Number(cov.rows[0]?.recent ?? 0)
  const baselineBots = Number(cov.rows[0]?.baseline ?? 0)
  const ratio = baselineBots > 0 ? recentBots / baselineBots : 1 // no baseline yet → don't cry wolf
  checks.push({
    name: 'enrich coverage',
    ok: ratio >= MIN_ENRICHMENT_COVERAGE,
    got: `${Math.round(ratio * 100)}% of baseline (${recentBots}/${baselineBots} bots)`,
    limit: `${Math.round(MIN_ENRICHMENT_COVERAGE * 100)}%`,
  })
} catch (e) {
  checks.push({ name: 'database', ok: false, got: e.message, limit: 'reachable' })
} finally {
  await c.end().catch(() => {})
}

const stagesOk = failedStages === ''
const freshOk = checks.every((x) => x.ok)
const healthy = stagesOk && freshOk

for (const x of checks) {
  console.log(`  ${x.ok ? '✓' : '✗'} ${x.name.padEnd(14)} ${x.got}  (limit ${x.limit})`)
}
console.log(`  ${stagesOk ? '✓' : '✗'} ${'stages'.padEnd(14)} ${stagesOk ? 'all exited 0' : `FAILED: ${failedStages}`}`)

if (!healthy) {
  console.log('\n⚠️  UNHEALTHY — heartbeat NOT sent. UptimeRobot will alert on the missed ping.')
} else if (!process.env.HEARTBEAT_URL) {
  console.log('\n✓ healthy — but HEARTBEAT_URL is unset, so no ping sent. Add it to .env to enable.')
} else {
  try {
    const res = await fetch(process.env.HEARTBEAT_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })
    console.log(`\n✓ healthy — heartbeat sent (HTTP ${res.status}).`)
  } catch (e) {
    // Don't let a monitoring hiccup look like a pipeline failure.
    console.log(`\n✓ healthy — but heartbeat ping failed: ${e.message}`)
  }
}

// Always exit 0: this is a reporter, not a gate. The heartbeat's absence is the signal.
process.exit(0)
