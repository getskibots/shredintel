#!/usr/bin/env node
/** inspect-join-test.mjs <botId> — CORRECTED taxonomy (per Brandon's 42-field
 *  export: source_type=TEXT means the bot RETRIEVED curated Q&A entries →
 *  grounded, not model-generated). Buckets: Curated Q&A (TEXT) / Website / File
 *  = GROUNDED; Ungrounded (null source, not failed); Failed (is_failed).
 *  Bridge: reply.user_id -> admin_conversation (time-bound) -> conversation_id
 *  -> conversation_intel.section. */
import 'dotenv/config'
import pg from 'pg'
const BOT = Number(process.argv[2] || 43)
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='120000ms'")
const rows = (sql) => c.query(sql).then((r) => r.rows)
const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)
const BUCKET = `case
  when x.source_type='TEXT' then 'CuratedQA'
  when x.source_type='WEBSITE' then 'Website'
  when x.source_type='FILE' then 'File'
  when x.is_failed then 'Failed'
  else 'Ungrounded' end`

// AGGREGATE (all replies for bot, no topic join needed)
console.log('=== AGGREGATE answer sources (bot ' + BOT + ', all replies) ===')
for (const r of await rows(`
  select ${BUCKET} bucket, count(*) n, round(100.0*count(*)/sum(count(*)) over(),1) pct
    from raw.admin_knowledge_reply x join raw.admin_user u on u.id=x.user_id
   where u.bot_id=${BOT} group by 1 order by 2 desc`))
  console.log(`  ${pad(r.bucket, 12)} ${String(r.n).padStart(7)}  ${r.pct}%`)

const BRIDGE = `
  raw.admin_knowledge_reply x
  join raw.admin_conversation cv on cv.user_id = x.user_id
    and x.sent_at >= cv.started_at
    and x.sent_at <= coalesce(cv.last_message_date_time, cv.started_at + interval '2 hours')
  join report.conversation_intel ci on ci.conversation_id = cv.id and ci.bot_id=${BOT}`

// PER-TOPIC with corrected buckets — grounded% + the real gap signals
console.log('\n=== per-topic (substantive): grounded% · ungrounded% · failed ===')
for (const r of await rows(`
  with j as (select ci.section topic, ${BUCKET} bucket from ${BRIDGE} where ci.substantive and ci.section is not null)
  select topic, count(*) n,
         round(100.0*count(*) filter(where bucket in ('CuratedQA','Website','File'))/count(*),0) grounded,
         round(100.0*count(*) filter(where bucket='Ungrounded')/count(*),0) ungrounded,
         count(*) filter(where bucket='Failed') failed,
         round(100.0*count(*) filter(where bucket='Failed')/count(*),1) failed_pct
    from j group by topic order by n desc limit 16`))
  console.log(`  ${pad(r.topic, 26)} n=${pad(r.n, 6)} grounded=${pad(r.grounded + '%', 5)} ungrounded=${pad(r.ungrounded + '%', 5)} failed=${pad(r.failed, 4)}(${r.failed_pct}%)`)

await c.end()
console.log('\ndone.')
