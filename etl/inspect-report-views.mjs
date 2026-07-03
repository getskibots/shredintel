#!/usr/bin/env node
/** inspect-report-views.mjs — read-only. Dump report.* definitions + bot-2 data
 *  so we learn the authoritative bot-attribution join before extending. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('=== report.* objects ===')
const { rows: objs } = await c.query(`
  select table_name, table_type from information_schema.tables where table_schema='report'
  union all
  select matviewname, 'MATVIEW' from pg_matviews where schemaname='report'
  order by 1`)
for (const r of objs) console.log(`  ${r.table_name.padEnd(34)} ${r.table_type}`)

const views = ['sender_mix_stack', 'outcome_timeline', 'demand_heatmap']
for (const v of views) {
  console.log(`\n===== def: report.${v} =====`)
  try {
    const { rows } = await c.query(`select pg_get_viewdef('report.${v}'::regclass, true) def`)
    console.log(rows[0].def)
  } catch (e) { console.log('  err:', e.message.split('\n')[0]) }
}

console.log('\n=== bot-2 sender_mix_stack (recent 5 days) ===')
try {
  const { rows } = await c.query(`select * from report.sender_mix_stack where bot_id=2 order by day desc limit 5`)
  for (const r of rows) console.log('  ', JSON.stringify(r))
  const { rows: [agg] } = await c.query(
    `select count(*) days, min(day) min_day, max(day) max_day, sum(total_messages) msgs from report.sender_mix_stack where bot_id=2`)
  console.log('  bot-2 all-time in view:', JSON.stringify(agg))
} catch (e) { console.log('  err:', e.message.split('\n')[0]) }

console.log('\n=== bot-2 outcome_timeline (recent 5 days) ===')
try {
  const { rows } = await c.query(`select * from report.outcome_timeline where bot_id=2 order by day desc limit 5`)
  for (const r of rows) console.log('  ', JSON.stringify(r))
} catch (e) { console.log('  err:', e.message.split('\n')[0]) }

// which bot_ids actually have data (top 10 by messages)?
console.log('\n=== top bots by messages in report.sender_mix_stack ===')
try {
  const { rows } = await c.query(
    `select bot_id, sum(total_messages) msgs, max(day) last_day from report.sender_mix_stack group by 1 order by 2 desc limit 10`)
  for (const r of rows) console.log(`  bot ${String(r.bot_id).padEnd(6)} msgs=${String(r.msgs).padEnd(10)} last_day=${r.last_day}`)
} catch (e) { console.log('  err:', e.message.split('\n')[0]) }

await c.end()
console.log('\ndone.')
