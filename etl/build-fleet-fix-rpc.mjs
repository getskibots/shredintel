#!/usr/bin/env node
/**
 * build-fleet-fix-rpc.mjs — report.fleet_fix(p_from, p_to): the daily-fix summary
 * (mood / signal / top asks / flavor) aggregated over ANY date range, so the
 * unified Master'Botter view can show the heartbeat for All time, 90d, today, etc.
 *
 * Reads report.conversation_intel DIRECTLY (the enrichment table) over [p_from,
 * p_to] — NOT a pre-aggregated matview. That's deliberate: a fleet_daily_fix
 * matview kept getting cascade-dropped by the nightly enrichment rebuild, causing
 * a silent overnight outage. Reading the source table is a touch slower on huge
 * ranges but never disappears. Volume + cost come separately from fleet_usage.
 *
 * SECURITY DEFINER, anon-exec (aggregate-only). Prod write, idempotent.
 *   node build-fleet-fix-rpc.mjs
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

await c.query('drop function if exists report.fleet_fix(date, date)')
await c.query(`
create or replace function report.fleet_fix(p_from date, p_to date)
returns table (
  substantive  bigint,
  positive     bigint,
  neutral      bigint,
  negative     bigint,
  high_urgency bigint,
  wanted_human bigint,
  resolved     bigint,
  partial      bigint,
  unresolved   bigint,
  categories   jsonb,
  flavors      jsonb
)
language sql stable security definer
set search_path = report, public
as $fn$
  select
    count(*) filter (where substantive)::bigint,
    count(*) filter (where sentiment = 'Positive')::bigint,
    count(*) filter (where sentiment = 'Neutral')::bigint,
    count(*) filter (where sentiment = 'Negative')::bigint,
    count(*) filter (where urgency ilike 'High%')::bigint,
    count(*) filter (where handover is not null and handover not in ('None',''))::bigint,
    count(*) filter (where resolution = 'Resolved')::bigint,
    count(*) filter (where resolution = 'Partial')::bigint,
    count(*) filter (where resolution = 'Unresolved')::bigint,
    coalesce((select jsonb_object_agg(category, n)
                from (select category, count(*) n from report.conversation_intel
                       where day between p_from and p_to and category is not null
                       group by category) x), '{}'::jsonb),
    coalesce((select jsonb_object_agg(flavor, n)
                from (select flavor, count(*) n from report.conversation_intel
                       where day between p_from and p_to
                         and flavor is not null and flavor not in ('None','none','')
                       group by flavor) x), '{}'::jsonb)
  from report.conversation_intel
  where day between p_from and p_to
$fn$`)
await c.query('grant execute on function report.fleet_fix(date, date) to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// sanity: all-time + a recent single day
for (const [lbl, from, to] of [
  ['ALL TIME', '(current_date-730)::date', '(current_date-1)::date'],
  ['last complete day', "(select max(day) from report.fleet_daily_fix where day < (now() at time zone 'utc')::date and substantive>0)", "(select max(day) from report.fleet_daily_fix where day < (now() at time zone 'utc')::date and substantive>0)"],
]) {
  const t0 = Date.now()
  const { rows: [r] } = await c.query(`select * from report.fleet_fix(${from}, ${to})`)
  const ms = Date.now() - t0
  const top = Object.entries(r.categories).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(' · ')
  const fl = Object.entries(r.flavors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'
  const pct = r.substantive > 0 ? Math.round((100 * r.positive) / r.substantive) : 0
  console.log(`✓ ${lbl} (${ms}ms): ${r.substantive} substantive · ${pct}% pos · ${r.high_urgency} urgent · ${r.resolved} resolved`)
  console.log(`    asks: ${top}`)
  console.log(`    flavor: ${fl}`)
}
await c.end()
