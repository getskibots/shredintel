#!/usr/bin/env node
/** bot-states.mjs — read-only. Every state-like flag on admin_bot + its value spread. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('\n=== flag / enum columns (distinct values) ===')
const flags = ['active', 'type', 'is_id_public', 'nlp_enabled', 'isnlpsynced',
  'contextualizer_enabled', 'generated_replies_enabled']
for (const f of flags) {
  try {
    const { rows } = await c.query(`select "${f}"::text v, count(*) c from raw.admin_bot group by 1 order by 2 desc`)
    console.log(`  ${f.padEnd(26)} ${rows.map((r) => `${r.v}=${r.c}`).join('  ')}`)
  } catch (e) { console.log(`  ${f}: ${e.message.split('\n')[0]}`) }
}

console.log('\n=== integration/config presence (attached vs not) ===')
const presence = ['public_identifier', 'voice_configs_id', 'twilio_configs_id',
  'dialogflow_configs_id', 'odin_configs_id', 'support_settings_id', 'greeting_text']
for (const p of presence) {
  const { rows: [r] } = await c.query(
    `select count(*) filter (where "${p}" is not null and length("${p}"::text) > 0) has,
            count(*) filter (where "${p}" is null or length("${p}"::text) = 0) missing
       from raw.admin_bot`)
  console.log(`  ${p.padEnd(22)} attached=${String(r.has).padStart(4)}  missing=${String(r.missing).padStart(4)}`)
}

console.log('\n=== cross-tab: active × is_id_public ===')
const { rows: cross } = await c.query(
  `select active::text a, is_id_public::text p, count(*) c from raw.admin_bot group by 1,2 order by 1,2`)
for (const r of cross) console.log(`  active=${r.a}  is_id_public=${r.p}  →  ${r.c} bots`)

console.log('\n=== who last edited (updated_by) — top 10 ===')
const { rows: edt } = await c.query(
  `select coalesce(updated_by::text,'(null)') u, count(*) c from raw.admin_bot group by 1 order by 2 desc limit 10`)
for (const r of edt) console.log(`  updated_by=${r.u.padEnd(8)} ${r.c}`)

await c.end()
