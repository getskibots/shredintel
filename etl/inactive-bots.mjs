#!/usr/bin/env node
/** inactive-bots.mjs — read-only. The 138 inactive (active=0) bots — should NOT appear in the admin. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(`
  select id, coalesce(nullif(trim(name), ''), '(unnamed)') as name, type
    from raw.admin_bot where active = 0 order by lower(coalesce(name, ''))`)

console.log(`\nINACTIVE bots (active=0): ${rows.length}\n`)
for (const r of rows) console.log(`  ${String(r.id).padStart(4)}  ${r.name}`)

await c.end()
