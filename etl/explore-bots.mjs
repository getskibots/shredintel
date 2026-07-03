#!/usr/bin/env node
/** explore-bots.mjs — read-only. What controls which bots are visible/active/deleted. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows: cols } = await c.query(
  `select column_name n from information_schema.columns
    where table_schema='raw' and table_name='admin_bot' order by ordinal_position`)
const names = cols.map((r) => r.n)
console.log('\nadmin_bot columns:\n  ' + names.join(', '))

const { rows: [{ tot }] } = await c.query('select count(*) tot from raw.admin_bot')
console.log(`\ntotal rows in admin_bot: ${tot}`)

async function dist(col) {
  const { rows } = await c.query(
    `select "${col}"::text v, count(*) c from raw.admin_bot group by 1 order by 2 desc limit 10`)
  console.log(`\n"${col}" distribution:`)
  for (const r of rows) console.log(`  ${String(r.v).padEnd(18)} ${r.c}`)
}

for (const col of ['active', 'type']) if (names.includes(col)) await dist(col)

if (names.includes('parent_bot_id')) {
  const { rows: [r] } = await c.query(
    `select count(*) filter (where parent_bot_id is null) top_level,
            count(*) filter (where parent_bot_id is not null) child from raw.admin_bot`)
  console.log(`\nparent_bot_id: ${r.top_level} top-level (no parent), ${r.child} child bots`)
}

// any soft-delete / visibility flags
const flagCols = names.filter((n) => /delet|remov|archiv|hidden|disabl|enabl|visib|status|state/i.test(n))
for (const col of flagCols) if (!['active', 'type'].includes(col)) await dist(col)

// best estimate of "what the Botscrew admin lists"
if (names.includes('active') && names.includes('parent_bot_id')) {
  const { rows: [r] } = await c.query(`
    select count(*) filter (where active=1 and parent_bot_id is null) active_top,
           count(*) filter (where active=1) active_all,
           count(*) filter (where parent_bot_id is null) top_all
      from raw.admin_bot`)
  console.log(`\n➤ active + top-level (likely what the admin shows): ${r.active_top}`)
  console.log(`  active (any level): ${r.active_all}   ·   top-level (any status): ${r.top_all}`)
  const { rows: bt } = await c.query(
    `select type, count(*) c from raw.admin_bot where active=1 and parent_bot_id is null group by type order by c desc`)
  console.log('  active + top-level by type: ' + bt.map((r) => `${r.type} ${r.c}`).join(' · '))
}

await c.end()
