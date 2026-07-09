#!/usr/bin/env node
/**
 * refresh.mjs — REFRESH every report.* materialized view so the dashboard reflects
 * the latest synced + enriched data. Runs `report.refresh_all_materialized_views()`
 * from a droplet node connection with `statement_timeout = 0`, so it is NOT capped
 * at the ~2 minutes Supabase's pg_cron allows (the full refresh takes ~7-8 min).
 *
 * This is the nightly refresh step (see nightly.sh); it supersedes the failing
 * pg_cron `nightly-report-refresh` job. Plain REFRESH (not rebuild) — picks up new
 * rows; use rebuild.mjs only when a matview DEFINITION changes.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout to '0'")
const t0 = Date.now()
console.log(`refreshing all report.* matviews … ${new Date().toISOString()}`)
try {
  await c.query('select report.refresh_all_materialized_views()')
  console.log(`✓ refreshed in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
} catch (e) {
  console.error(`✗ refresh failed after ${((Date.now() - t0) / 1000).toFixed(0)}s: ${e.message}`)
  await c.end()
  process.exit(1)
}
await c.end()
