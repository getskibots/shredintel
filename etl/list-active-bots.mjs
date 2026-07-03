#!/usr/bin/env node
/** list-active-bots.mjs — read-only. Every active bot, to verify vs the Botscrew admin. */
import 'dotenv/config'
import pg from 'pg'
import fs from 'node:fs'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(`
  select id,
         coalesce(nullif(trim(name), ''), '(unnamed)') as name,
         type,
         case when parent_bot_id is null then 'top-level' else 'child' end as level
    from raw.admin_bot
   where active = 1
   order by lower(coalesce(name, ''))`)

const csv = 'id,name,type,level\n' +
  rows.map((r) => `${r.id},"${r.name.replace(/"/g, '""')}",${r.type},${r.level}`).join('\n')
const out = 'C:/Users/Brandon/Downloads/active_bots.csv'
fs.writeFileSync(out, csv)

const byType = {}
for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1
const top = rows.filter((r) => r.level === 'top-level').length

console.log(`\nACTIVE bots (active=1): ${rows.length}`)
console.log(`  by type: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`  top-level: ${top}  ·  child: ${rows.length - top}`)
console.log(`\nfull list written to: ${out}`)
console.log('\nfirst 30 (alphabetical):')
for (const r of rows.slice(0, 30)) {
  console.log(`  ${String(r.id).padStart(4)}  ${r.name.slice(0, 42).padEnd(43)} ${r.type.padEnd(8)} ${r.level}`)
}

await c.end()
