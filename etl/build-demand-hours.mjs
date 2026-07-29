#!/usr/bin/env node
/**
 * build-demand-hours.mjs — report.demand_hours: chat conversation demand by
 * resort-LOCAL hour + day-of-week, per bot/day. The chat twin of the voice
 * report.call_hours matview.
 *
 * Powers the redesigned "When your guests reach out" section:
 *   - hourly filled-area curve (peak hour)      → group by hour_local
 *   - day-of-week bars (busiest day)            → group by isodow
 *   - working vs after-hours donut              → isodow 1..5 & hour 9..17
 *
 * Source: report.conversation_time (already resort-local: hour_local 0..23,
 * isodow 1=Mon..7=Sun, day = local calendar day). Aggregate counts only — no
 * PII — so it is anon-granted like the other report.* read surfaces.
 * Idempotent; refreshed nightly via sync.mjs MATVIEWS.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='600000ms'")

console.log('Building report.demand_hours …')
await c.query('drop materialized view if exists report.demand_hours cascade')
await c.query(`
  create materialized view report.demand_hours as
  select
    ct.bot_id,
    ct.day,                       -- resort-local calendar day (for period filtering)
    ct.hour_local::int  as hour_local,   -- 0..23, resort-local
    ct.isodow::int      as isodow,       -- 1=Mon .. 7=Sun, resort-local
    count(*)::int       as conversations
  from report.conversation_time ct
  where ct.substantive                      -- the same analyzed base as every other card
    and ct.hour_local is not null and ct.isodow is not null
  group by ct.bot_id, ct.day, ct.hour_local, ct.isodow
`)
await c.query('create index on report.demand_hours (bot_id)')
await c.query('create index on report.demand_hours (bot_id, day)')
await c.query('grant select on report.demand_hours to anon, authenticated')

const { rows } = await c.query(`
  select count(*)::int rows, count(distinct bot_id)::int bots,
         sum(conversations)::int convos from report.demand_hours`)
console.log('  ✓ demand_hours:', JSON.stringify(rows[0]))

// sanity: bot 16 hourly + working/after split
const peek = await c.query(`
  select
    sum(conversations)::int total,
    sum(conversations) filter (where isodow<=5 and hour_local between 9 and 17)::int working,
    (select hour_local from report.demand_hours where bot_id=16
       group by hour_local order by sum(conversations) desc limit 1) peak_hour
  from report.demand_hours where bot_id=16`)
console.log('  bot 16 sanity:', JSON.stringify(peek.rows[0]))

await c.end()
console.log('Done.')
