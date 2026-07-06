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

await c.query(`create or replace view report.knowledge_layer_mix as
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
   group by 1, 2, 3`)
await c.query(`grant select on report.knowledge_layer_mix to anon, authenticated`)
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.knowledge_layer_mix created + granted + PostgREST reloaded')

// verify vs JH (bot 43)
const { rows } = await c.query(`
  select layer, sum(answers)::int n, round(100.0*sum(answers)/sum(sum(answers)) over(),1) pct
    from report.knowledge_layer_mix where bot_id=43 group by layer order by n desc`)
console.log('\nknowledge_layer_mix (bot 43, all-time):')
for (const r of rows) console.log(`  ${String(r.layer).padEnd(14)} ${String(r.n).padStart(7)}  ${r.pct}%`)
const grounded = rows.filter((r) => ['Text Edits', 'Website', 'Files'].includes(r.layer)).reduce((s, r) => s + Number(r.n), 0)
const total = rows.reduce((s, r) => s + Number(r.n), 0)
console.log(`\n  grounding rate (Text Edits + Website + Files): ${(100 * grounded / Math.max(1, total)).toFixed(1)}%`)

await c.end()
console.log('\ndone.')
