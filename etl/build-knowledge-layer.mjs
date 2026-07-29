#!/usr/bin/env node
/**
 * build-knowledge-layer.mjs — report.knowledge_layer_mix: WHERE the bot's
 * answers come from, by Botscrew "Knowledge Layer" (the exact layers the resort
 * manages in their admin), per bot/day.
 *
 * Maps raw.admin_knowledge_reply.source_type → the admin layer:
 *   TEXT → Text Edits · WEBSITE → Website · FILE → Files ·
 *   null → Instructions (answered from the prompt, no retrieved entry) ·
 *   is_failed → Failed (couldn't answer).
 *
 * Aggregate counts only — no PII. Bot-scoped via user_id → admin_user.bot_id.
 * This replaces the misleading "sourced/unsourced gap". Idempotent.
 * (Per-topic + per-source drill land in follow-up views.)
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

// MATERIALIZED: aggregating over 500k+ raw.admin_knowledge_reply rows takes
// ~3s as a plain view, which risks the dashboard's live-fetch timeout on a cold
// start. Precompute + index; refreshed nightly via sync.mjs MATVIEWS.
// Drop whatever exists under this name — a plain view (Phase 1 legacy) OR a
// materialized view (since). `drop view if exists` THROWS (not skips) on a matview
// and vice-versa, so try both and swallow the type-mismatch — keeps re-runs idempotent.
for (const drop of [
  'drop materialized view if exists report.knowledge_layer_mix cascade',
  'drop view if exists report.knowledge_layer_mix cascade',
]) { try { await c.query(drop) } catch { /* wrong object type — the other drop applies */ } }
await c.query(`create materialized view report.knowledge_layer_mix as
  select u.bot_id,
         x.sent_at::date as day,
         case
           when x.is_failed then 'Failed'
           when x.source_type = 'TEXT' then 'Text Edits'
           when x.source_type = 'WEBSITE' then 'Website'
           when x.source_type = 'FILE' then 'Files'
           else 'Instructions'
         end as layer,
         count(*)::int as answers
    from raw.admin_knowledge_reply x
    join raw.admin_user u on u.id = x.user_id
   where u.bot_id is not null
   group by 1, 2, 3
  union all
  -- Live data: replies produced by an AI-action atom (get_snow_report / lift status /
  -- weather…). These NEVER create an admin_knowledge_reply row, so before this they
  -- were INVISIBLE in the mix. Identified definitionally — the reply's atom IS an
  -- action handler (admin_ai_action.handler_atom_id) — not a fuzzy time window. A real
  -- answer source alongside your content, so it counts toward grounding.
  select u.bot_id,
         ch.timestamp::date as day,
         'Live data' as layer,
         count(*)::int as answers
    from raw.admin_chat_history ch
    join raw.admin_conversation cv on cv.id = ch.conversation_id
    join raw.admin_user u on u.id = cv.user_id
    join (select distinct bot_id, handler_atom_id
            from raw.admin_ai_action where handler_atom_id is not null) aa
      on aa.bot_id = u.bot_id and aa.handler_atom_id = ch.atom_entity_id
   where u.bot_id is not null
   group by 1, 2, 3`)
await c.query('create index on report.knowledge_layer_mix (bot_id, day)')
await c.query(`grant select on report.knowledge_layer_mix to anon, authenticated`)
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.knowledge_layer_mix (matview) created + indexed + granted')

// verify vs JH (bot 43)
const { rows } = await c.query(`
  select layer, sum(answers)::int n, round(100.0*sum(answers)/sum(sum(answers)) over(),1) pct
    from report.knowledge_layer_mix where bot_id=43 group by layer order by n desc`)
console.log('\nknowledge_layer_mix (bot 43, all-time):')
for (const r of rows) console.log(`  ${String(r.layer).padEnd(14)} ${String(r.n).padStart(7)}  ${r.pct}%`)
const grounded = rows.filter((r) => ['Text Edits', 'Website', 'Files'].includes(r.layer)).reduce((s, r) => s + Number(r.n), 0)
const total = rows.reduce((s, r) => s + Number(r.n), 0)
console.log(`\n  grounding rate (Text Edits + Website + Files): ${(100 * grounded / Math.max(1, total)).toFixed(1)}%`)

// ── Per-topic layer mix (the fill-list) — MATERIALIZED (heavy conversation
// bridge). reply.user_id → admin_conversation (time-bound) → conversation_id →
// conversation_intel.section. Registered in sync.mjs MATVIEWS for nightly refresh.
console.log('\nBuilding report.knowledge_layer_by_section (matview) …')
await c.query('drop materialized view if exists report.knowledge_layer_by_section cascade')
await c.query(`create materialized view report.knowledge_layer_by_section as
  select ci.bot_id, ci.day, ci.section,
         case
           when x.is_failed then 'Failed'
           when x.source_type = 'TEXT' then 'Text Edits'
           when x.source_type = 'WEBSITE' then 'Website'
           when x.source_type = 'FILE' then 'Files'
           else 'Instructions'
         end as layer,
         count(*)::int as answers
    from raw.admin_knowledge_reply x
    join raw.admin_conversation cv
      on cv.user_id = x.user_id
     and x.sent_at >= cv.started_at
     and x.sent_at <= coalesce(cv.last_message_date_time, cv.started_at + interval '2 hours')
    join report.conversation_intel ci on ci.conversation_id = cv.id
   where ci.substantive is true and ci.section is not null
   group by 1, 2, 3, 4`)
await c.query('create index on report.knowledge_layer_by_section (bot_id, day)')
await c.query('grant select on report.knowledge_layer_by_section to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.knowledge_layer_by_section created + indexed + granted')

// verify — top topics by "unbacked" (Instructions + Failed) answers for bot 43
const { rows: topics } = await c.query(`
  select section,
         sum(answers)::int total,
         sum(answers) filter (where layer in ('Text Edits','Website','Files'))::int grounded,
         sum(answers) filter (where layer='Instructions')::int instructions,
         sum(answers) filter (where layer='Failed')::int failed
    from report.knowledge_layer_by_section where bot_id=43
   group by section
   order by (sum(answers) filter (where layer in ('Instructions','Failed'))) desc
   limit 10`)
console.log('\nper-topic (bot 43) — ranked by unbacked (Instructions + Failed):')
for (const t of topics) {
  const backed = t.total > 0 ? (100 * t.grounded / t.total).toFixed(0) : '0'
  console.log(`  ${String(t.section).padEnd(28)} n=${String(t.total).padStart(6)}  backed=${backed}%  instructions=${t.instructions}  failed=${t.failed}`)
}

await c.end()
console.log('\ndone.')
