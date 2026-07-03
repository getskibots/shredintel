#!/usr/bin/env node
/**
 * build-intel-views.mjs — aggregate views over report.conversation_intel that
 * the dashboard reads for §2 (categories) and §3 (sentiment). Plain VIEWS (not
 * matviews) so they reflect new enrichment immediately — the base table is
 * indexed on (bot_id, day) so per-bot/day filtered reads stay fast. Substantive
 * conversations only (matches the ShredIntel methodology).
 *
 * Run after enrich-backfill.mjs. Idempotent.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const dims = [
  ['intel_section', 'section'],       // resort knowledge-section demand (§2)
  ['intel_category', 'category'],     // legacy spine (kept for reference)
  ['intel_sentiment', 'sentiment'],
  ['intel_urgency', 'urgency'],
  ['intel_handover', 'handover'],
]
for (const [view, col] of dims) {
  await c.query(`create or replace view report.${view} as
    select bot_id, day, ${col} as key, count(*)::int as conversations
      from report.conversation_intel
     where substantive is true and ${col} is not null
     group by bot_id, day, ${col}`)
  await c.query(`grant select on report.${view} to anon, authenticated`)
}

// ecommerce pinchpoints — cross-cutting conversion/account friction (excludes "None")
await c.query(`create or replace view report.intel_pinchpoint as
  select bot_id, day, pinchpoint as key, count(*)::int as conversations,
         count(*) filter (where sentiment = 'Negative')::int as negative
    from report.conversation_intel
   where substantive is true and pinchpoint is not null and pinchpoint <> 'None'
   group by bot_id, day, pinchpoint`)
await c.query(`grant select on report.intel_pinchpoint to anon, authenticated`)

// raw topics per conversation (for "top guest questions" sampling in the report)
await c.query(`create or replace view report.intel_topics as
  select bot_id, day, category, sentiment, topic
    from report.conversation_intel
   where substantive is true and topic is not null and topic <> ''`)
await c.query(`grant select on report.intel_topics to anon, authenticated`)

await c.query(`notify pgrst, 'reload schema'`)
console.log("✓ intel views created + granted + PostgREST reloaded")

// verify against JH (bot 43)
for (const [view] of dims) {
  const { rows } = await c.query(
    `select key, sum(conversations) n from report.${view} where bot_id=43 group by key order by n desc limit 12`)
  console.log(`\n${view} (bot 43):`)
  for (const r of rows) console.log(`  ${String(r.key).padEnd(28)} ${r.n}`)
}

const { rows: [tot] } = await c.query(
  `select count(*) enriched, count(*) filter (where substantive) substantive from report.conversation_intel where bot_id=43`)
console.log(`\nconversation_intel bot 43: ${tot.enriched} enriched, ${tot.substantive} substantive`)

await c.end()
console.log('\ndone.')
