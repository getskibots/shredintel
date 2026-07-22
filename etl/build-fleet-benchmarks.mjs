#!/usr/bin/env node
/**
 * build-fleet-benchmarks.mjs — report.fleet_benchmarks (one anon row).
 *
 * Cross-partner benchmarks so a bot's numbers can be shown "vs typical resort".
 * Today: engagement rate (engaged / chats) — the per-bot median/quartiles across
 * CHAT bots with >= 500 chats (small/test bots excluded so they don't skew it).
 * Rebuilds from report.conversation_depth + report.bot_channel; refreshed nightly.
 *
 * Prod write, idempotent.  node build-fleet-benchmarks.mjs
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

await c.query('drop materialized view if exists report.fleet_benchmarks cascade')
await c.query(`create materialized view report.fleet_benchmarks as
  with per_bot as (
    select cd.bot_id,
           sum(cd.conversations) chats,
           sum(cd.engaged_conversations) engaged
    from report.conversation_depth cd
    join report.bot_channel bc on bc.bot_id = cd.bot_id and bc.channel = 'chat'
    group by cd.bot_id
    having sum(cd.conversations) >= 500
  ),
  rates as (select (engaged::numeric / nullif(chats, 0)) rate from per_bot)
  select
    1 as id,
    percentile_cont(0.5)  within group (order by rate) as engagement_median,
    percentile_cont(0.25) within group (order by rate) as engagement_p25,
    percentile_cont(0.75) within group (order by rate) as engagement_p75,
    min(rate) as engagement_min,
    max(rate) as engagement_max,
    count(*)::int as n_bots
  from rates`)
await c.query('create unique index fleet_benchmarks_pk on report.fleet_benchmarks (id)')
await c.query('grant select on report.fleet_benchmarks to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const r = (await c.query('select * from report.fleet_benchmarks')).rows[0]
console.log('✓ report.fleet_benchmarks built + granted')
console.log(`  n_bots=${r.n_bots} · engagement median=${(100 * r.engagement_median).toFixed(1)}% (p25 ${(100 * r.engagement_p25).toFixed(1)}% – p75 ${(100 * r.engagement_p75).toFixed(1)}%; range ${(100 * r.engagement_min).toFixed(1)}–${(100 * r.engagement_max).toFixed(1)}%)`)
await c.end()
