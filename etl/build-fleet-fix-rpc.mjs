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

// ── The fleet OUTCOME model (single source of truth; the drill RPC mirrors it) ──
// Every substantive conversation lands in exactly one bucket, priority order:
//   needs_human  → a person was clearly pulled in  (Clear Handover / Escalation Required)
//   ai_solved    → the AI resolved it, no clear handoff  (resolution=Resolved, no clear handover)
//   unresolved   → everything else (open / partial / possible-handover-but-not-resolved)
// 🔑 Bug fixed: the real no-handover value is 'No Handover' (NOT 'None'), so the old
// `handover not in ('None','')` counted the AI-solo conversations as "wanted a human"
// — inverting the metric. Handover to a human = Clear Handover / Escalation Required only.
await c.query('drop function if exists report.fleet_fix(date, date)')
await c.query(`
create or replace function report.fleet_fix(p_from date, p_to date)
returns table (
  substantive     bigint,
  positive        bigint,
  neutral         bigint,
  negative        bigint,
  high_urgency    bigint,
  wanted_human    bigint,   -- clear handover + escalation (the corrected count)
  resolved        bigint,
  partial         bigint,
  unresolved      bigint,
  ai_solved       bigint,   -- outcome: solved by AI, no human
  needs_human     bigint,   -- outcome: pulled in a human
  unresolved_open bigint,   -- outcome: neither cleanly solved nor escalated
  categories      jsonb,
  flavors         jsonb
)
language sql stable security definer
set search_path = report, public
as $fn$
  select
    count(*) filter (where substantive)::bigint,
    count(*) filter (where substantive and sentiment = 'Positive')::bigint,
    count(*) filter (where substantive and sentiment = 'Neutral')::bigint,
    count(*) filter (where substantive and sentiment = 'Negative')::bigint,
    count(*) filter (where substantive and urgency ilike 'High%')::bigint,
    count(*) filter (where substantive and coalesce(handover,'') in ('Clear Handover','Escalation Required'))::bigint,
    count(*) filter (where substantive and resolution = 'Resolved')::bigint,
    count(*) filter (where substantive and resolution = 'Partial')::bigint,
    count(*) filter (where substantive and resolution = 'Unresolved')::bigint,
    -- outcome buckets (mutually exclusive, priority: human → solved → open)
    count(*) filter (where substantive and coalesce(handover,'') not in ('Clear Handover','Escalation Required') and resolution = 'Resolved')::bigint,
    count(*) filter (where substantive and coalesce(handover,'') in ('Clear Handover','Escalation Required'))::bigint,
    count(*) filter (where substantive and coalesce(handover,'') not in ('Clear Handover','Escalation Required') and resolution is distinct from 'Resolved')::bigint,
    coalesce((select jsonb_object_agg(category, n)
                from (select category, count(*) n from report.conversation_intel
                       where day between p_from and p_to and substantive and category is not null
                       group by category) x), '{}'::jsonb),
    coalesce((select jsonb_object_agg(flavor, n)
                from (select flavor, count(*) n from report.conversation_intel
                       where day between p_from and p_to and substantive
                         and flavor is not null and flavor not in ('None','none','')
                       group by flavor) x), '{}'::jsonb)
  from report.conversation_intel
  where day between p_from and p_to
$fn$`)
await c.query('grant execute on function report.fleet_fix(date, date) to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// sanity: all-time + a recent single day
const lastDay = "(select max(day) from report.conversation_intel where day < (now() at time zone 'utc')::date and substantive)"
for (const [lbl, from, to] of [
  ['ALL TIME', '(current_date-730)::date', '(current_date-1)::date'],
  ['last complete day', lastDay, lastDay],
]) {
  const t0 = Date.now()
  const { rows: [r] } = await c.query(`select * from report.fleet_fix(${from}, ${to})`)
  const ms = Date.now() - t0
  const top = Object.entries(r.categories).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(' · ')
  const fl = Object.entries(r.flavors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'
  const pct = r.substantive > 0 ? Math.round((100 * r.positive) / r.substantive) : 0
  const opct = (n) => r.substantive > 0 ? `${Math.round((100 * n) / r.substantive)}%` : '0%'
  const sum = Number(r.ai_solved) + Number(r.needs_human) + Number(r.unresolved_open)
  console.log(`✓ ${lbl} (${ms}ms): ${r.substantive} substantive · ${pct}% pos · ${r.high_urgency} urgent · ${r.resolved} resolved`)
  console.log(`    OUTCOME: AI-solved ${r.ai_solved} (${opct(r.ai_solved)}) · needs-human ${r.needs_human} (${opct(r.needs_human)}) · unresolved ${r.unresolved_open} (${opct(r.unresolved_open)}) · sum=${sum} (=substantive? ${sum === Number(r.substantive)})`)
  console.log(`    asks: ${top}`)
  console.log(`    flavor: ${fl}`)
}
await c.end()
