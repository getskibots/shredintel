#!/usr/bin/env node
/**
 * build-conversation-layer.mjs — per-conversation knowledge-layer attribution,
 * so the "Where answers come from" bar can drill to the actual conversations.
 *
 * The knowledge layer lives on raw.admin_knowledge_reply (per ANSWER), which has
 * no conversation_id — so we reuse the SAME proven bridge that powers
 * knowledge_layer_by_section: reply.user_id → admin_conversation (time-bound) →
 * conversation_intel.conversation_id. One row per (conversation, distinct layer).
 *
 *   report.conversation_layer       — matview (bot_id, day, conversation_id, layer)
 *   report.conversation_time_layer  — view: conversation_time + the layer column,
 *                                     so ConversationExplorer filters by .eq('layer', X)
 *
 * Aggregate/attribution only — no message text — so anon-granted like the other
 * drill sources. Idempotent; the matview is refreshed nightly via sync.mjs.
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

console.log('Building report.conversation_layer …')
await c.query('drop view if exists report.conversation_time_layer cascade')
await c.query('drop materialized view if exists report.conversation_layer cascade')
await c.query(`
  create materialized view report.conversation_layer as
  select distinct
    ci.bot_id,
    ci.day,
    cv.id as conversation_id,
    case
      when x.is_failed then 'Failed'
      when x.source_type = 'TEXT' then 'Text Edits'
      when x.source_type = 'WEBSITE' then 'Website'
      when x.source_type = 'FILE' then 'Files'
      else 'Instructions'
    end as layer
  from raw.admin_knowledge_reply x
  join raw.admin_conversation cv
    on cv.user_id = x.user_id
   and x.sent_at >= cv.started_at
   and x.sent_at <= coalesce(cv.last_message_date_time, cv.started_at + interval '2 hours')
  join report.conversation_intel ci on ci.conversation_id = cv.id
  where ci.substantive is true
`)
await c.query('create index on report.conversation_layer (bot_id, layer)')
await c.query('create index on report.conversation_layer (bot_id, conversation_id)')
await c.query('grant select on report.conversation_layer to anon, authenticated')

// The explorer lists from conversation_time; this view = conversation_time + layer
// so a layer drill is one .eq('layer', X) with the identical column shape.
console.log('Building report.conversation_time_layer view …')
await c.query(`
  create view report.conversation_time_layer as
  select c.*, l.layer
  from report.conversation_time c
  join report.conversation_layer l
    on l.bot_id = c.bot_id and l.conversation_id = c.conversation_id
`)
await c.query('grant select on report.conversation_time_layer to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const { rows } = await c.query(`
  select count(*)::int rows, count(distinct conversation_id)::int convos, count(distinct bot_id)::int bots
  from report.conversation_layer`)
console.log('  ✓ conversation_layer:', JSON.stringify(rows[0]))

console.log('\n  bot 16 — conversations per layer (drill counts) vs the answer-mix bar:')
const b = await c.query(`
  select layer, count(distinct conversation_id)::int conversations
  from report.conversation_layer where bot_id=16 group by layer order by conversations desc`)
for (const r of b.rows) console.log(`    ${String(r.layer).padEnd(14)} ${String(r.conversations).padStart(6)} conversations`)

await c.end()
console.log('\nDone.')
