#!/usr/bin/env node
/**
 * build-call-facts-stats.mjs — anon-safe per bot/day rollup of Twilio call facts
 * (report.call_facts is server-only: has the bot's number + cost). This view is
 * counts + durations only, safe for the dashboard. It's the TRUSTED source for
 * duration / talk-time (the mirror dur_sec is unreliable), and carries the
 * AI-vs-human split: total = Twilio parent duration, human = child leg (from
 * report.call_transfers), so AI-handled = total − human (floored at 0 in the app).
 *
 * Run AFTER build-call-facts.mjs (+ build-call-transfers.mjs for the human split).
 * Period-scopable via `day` (from call_base). Idempotent. Prod write.
 *   node build-call-facts-stats.mjs
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
await c.query("set statement_timeout='300000ms'")

await c.query('drop materialized view if exists report.call_facts_stats cascade')
await c.query(`create materialized view report.call_facts_stats as
  select cf.bot_id, cb.day,
    count(*)::int calls,
    count(*) filter (where cf.status = 'completed')::int completed,
    -- Twilio TRUTH duration (cap 1..7200s to drop bogus outliers)
    sum(cf.duration_sec) filter (where cf.duration_sec between 1 and 7200)::bigint talk_sec,
    (percentile_cont(0.5) within group (order by cf.duration_sec)
       filter (where cf.duration_sec between 1 and 7200))::int median_dur_sec,
    round(avg(cf.duration_sec) filter (where cf.duration_sec between 1 and 7200))::int avg_dur_sec,
    -- human leg (ground-truth transfers) → lets the app derive AI-handled = talk − human
    sum(t.human_talk_sec) filter (where t.transferred and t.answered and t.human_talk_sec between 1 and 7200)::bigint human_talk_sec
  from report.call_facts cf
  join report.call_base cb using (conversation_id)
  left join report.call_transfers t using (conversation_id)
  group by cf.bot_id, cb.day`)
await c.query('create unique index call_facts_stats_pk on report.call_facts_stats (bot_id, day)')
await c.query('grant select on report.call_facts_stats to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.call_facts_stats built + granted')

const v = (await c.query(`select
  sum(calls)::int calls, sum(completed)::int completed,
  round(sum(talk_sec)/3600.0,1) total_hrs,
  round(sum(human_talk_sec)/3600.0,1) human_hrs,
  round(greatest(sum(talk_sec)-sum(human_talk_sec),0)/3600.0,1) ai_hrs
  from report.call_facts_stats where bot_id=248`)).rows[0]
console.log(`bot 248: ${v.calls} calls · ${v.total_hrs}h total (Twilio) = ${v.ai_hrs}h AI-handled + ${v.human_hrs}h with a human`)
await c.end()
