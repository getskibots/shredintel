#!/usr/bin/env node
/**
 * build-transfer-stats.mjs — anon-safe per bot/day rollup of the ground-truth
 * transfers (report.call_transfers is server-only because it holds the destination
 * number; this view is just counts + duration, safe for the dashboard).
 *
 * Run AFTER build-call-transfers.mjs. Period-scopable via `day` (joined from
 * call_base). Idempotent. Prod write.  node build-transfer-stats.mjs
 *
 * NOTE: depends on report.call_base — if build-voice-views drops call_base CASCADE,
 * re-run this after. (Kept standalone so we don't re-run the whole voice pipeline.)
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

await c.query('drop materialized view if exists report.call_transfer_stats cascade')
await c.query(`create materialized view report.call_transfer_stats as
  select cb.bot_id, cb.day,
    count(*)::int checked,
    count(*) filter (where t.transferred)::int transfers,
    count(*) filter (where t.transferred and t.answered)::int answered_transfers,
    sum(t.human_talk_sec) filter (where t.transferred and t.human_talk_sec between 1 and 7200)::bigint human_talk_sec
  from report.call_base cb
  join report.call_transfers t using (conversation_id)
  group by cb.bot_id, cb.day`)
await c.query('create unique index call_transfer_stats_pk on report.call_transfer_stats (bot_id, day)')
await c.query('grant select on report.call_transfer_stats to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.call_transfer_stats built + granted')

const v = (await c.query(`select sum(transfers)::int transfers, sum(answered_transfers)::int answered,
  sum(checked)::int checked, round(sum(human_talk_sec)/nullif(sum(answered_transfers),0))::int avg_human
  from report.call_transfer_stats where bot_id=248`)).rows[0]
console.log(`bot 248: ${v.transfers}/${v.checked} calls transferred (${Math.round(100*v.transfers/Math.max(v.checked,1))}%) · ${v.answered} answered · ~${v.avg_human}s w/ human`)
await c.end()
