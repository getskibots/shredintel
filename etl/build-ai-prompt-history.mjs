#!/usr/bin/env node
/**
 * build-ai-prompt-history.mjs — version history for the AI-instruction layers.
 * Every save of report._ai_prompts snapshots a row here (done in api/_lib/db.ts
 * upsertPrompt), so the fleet MASTER (bot 0) — and any per-bot slave — can be
 * reviewed and restored. `_`-prefixed so schemaCatalog never exposes it to the
 * model; NOT anon-granted (GSB product IP, read via /api with the admin key over
 * the service-role pool). Idempotent; seeds the current prompts as the baseline.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query(`
  create table if not exists report._ai_prompt_history (
    id       bigint generated always as identity primary key,
    bot_id   int  not null,
    prompt   text not null,
    saved_at timestamptz not null default now()
  )`)
await c.query('create index if not exists ai_prompt_history_bot_saved on report._ai_prompt_history (bot_id, saved_at desc)')
// explicitly NOT anon/authenticated — GSB-only, read server-side via /api/prompt.
await c.query('revoke all on report._ai_prompt_history from anon, authenticated')

// Seed the current prompts as the baseline version (only if history is empty).
const { rows: [{ n }] } = await c.query('select count(*)::int n from report._ai_prompt_history')
if (n === 0) {
  const seeded = await c.query(`
    insert into report._ai_prompt_history (bot_id, prompt, saved_at)
      select bot_id, prompt, coalesce(updated_at, now()) from report._ai_prompts
      where coalesce(trim(prompt), '') <> ''
    returning bot_id`)
  console.log(`seeded ${seeded.rowCount} baseline version(s) from _ai_prompts`)
} else {
  console.log(`history already has ${n} rows — no seed`)
}

const { rows } = await c.query(`
  select count(*)::int total, count(*) filter (where bot_id=0)::int master_versions
  from report._ai_prompt_history`)
console.log('report._ai_prompt_history:', JSON.stringify(rows[0]))
await c.end()
console.log('Done.')
