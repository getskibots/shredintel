#!/usr/bin/env node
/**
 * build-fleet-timeseries.mjs — report.fleet_timeseries: one row per DAY, the whole
 * fleet rolled up. Powers the seasonality ribbon on Master'Botter: a preloaded
 * daily array the frontend windows client-side for instant scrubbing (volume +
 * mood over the seasons), while the brush sets the dashboard's date range.
 *
 * Depends ONLY on the report.conversation_intel TABLE (appended, never dropped),
 * so it can't cascade-drop the way a matview-on-a-matview did (the fleet_daily_fix
 * outage). Anon-readable (aggregate-only). Small (~600 rows) + indexed → instant.
 * Auto-refreshed by the nightly refresh_all_materialized_views (it's a report.*
 * matview). Prod write, idempotent.  node build-fleet-timeseries.mjs
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query('drop materialized view if exists report.fleet_timeseries')
await c.query(`
create materialized view report.fleet_timeseries as
  select day,
    count(*) filter (where substantive)::int                                   as convs,
    count(*) filter (where substantive and sentiment = 'Positive')::int        as pos,
    count(*) filter (where substantive and sentiment = 'Neutral')::int         as neu,
    count(*) filter (where substantive and sentiment = 'Negative')::int        as neg,
    count(*) filter (where substantive and resolution = 'Resolved')::int       as resolved
  from report.conversation_intel
  where day >= date '2024-10-01'
  group by day`)
await c.query('create unique index fleet_timeseries_day on report.fleet_timeseries (day)')
await c.query('grant select on report.fleet_timeseries to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const { rows } = await c.query(`select count(*) days, min(day) lo, max(day) hi,
  sum(convs) convs, round(100.0*sum(pos)/nullif(sum(convs),0)) pospct
  from report.fleet_timeseries`)
const r = rows[0]
console.log(`✓ report.fleet_timeseries · ${r.days} days (${r.lo?.toISOString?.().slice(0,10)} → ${r.hi?.toISOString?.().slice(0,10)}) · ${Number(r.convs).toLocaleString()} substantive · ${r.pospct}% positive`)
// peek: busiest week-ish sample
const { rows: top } = await c.query('select day, convs, pos, neg from report.fleet_timeseries order by convs desc limit 3')
for (const t of top) console.log(`   busiest: ${t.day.toISOString().slice(0,10)} — ${t.convs} convs (${t.pos} pos / ${t.neg} neg)`)
await c.end()
