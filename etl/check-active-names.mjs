#!/usr/bin/env node
/** check-active-names.mjs — read-only. Is the filter applied, and what testing/template names remain? */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows: [{ n }] } = await c.query('select count(*) n from public.bots')
console.log(`\npublic.bots total (what the dashboard reads): ${n}`)

const pattern = 'test|demo|template|\\bcopy\\b|clone|sample|\\bdev\\b|example|onboard|playground|training|placeholder|gnarbot|\\bqa\\b|xxx|zzz|\\brrr|ttt'
const { rows } = await c.query(
  `select id, name from public.bots where name ~* $1 order by lower(name)`, [pattern])

console.log(`\ntesting/template-language names STILL in the active list: ${rows.length}`)
for (const r of rows) console.log(`  #${String(r.id).padStart(4)}  ${r.name}`)

await c.end()
