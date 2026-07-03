#!/usr/bin/env node
/** bot-structure.mjs — read-only. The parent/child hierarchy of admin_bot. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// which parents do the child bots roll up to?
const { rows: parents } = await c.query(`
  select b.parent_bot_id as parent_id,
         coalesce(p.name, '(parent id ' || b.parent_bot_id || ' — not in table)') as parent_name,
         p.active as parent_active,
         count(*) as children,
         count(*) filter (where b.active = 1) as active_children
    from raw.admin_bot b
    left join raw.admin_bot p on p.id = b.parent_bot_id
   where b.parent_bot_id is not null
   group by b.parent_bot_id, p.name, p.active
   order by count(*) desc`)

console.log(`\n=== parents that have child bots (${parents.length} distinct parents) ===`)
for (const r of parents) {
  console.log(`  parent #${String(r.parent_id).padStart(4)} ${String(r.parent_name).slice(0, 34).padEnd(35)} active=${r.parent_active}  ${r.children} children (${r.active_children} active)`)
}

// top-level roots (no parent)
const { rows: roots } = await c.query(`
  select id, coalesce(nullif(trim(name),''),'(unnamed)') name, type, active
    from raw.admin_bot where parent_bot_id is null order by lower(coalesce(name,''))`)
console.log(`\n=== top-level bots — no parent (${roots.length}) ===`)
for (const r of roots.slice(0, 20)) console.log(`  #${String(r.id).padStart(4)} ${r.name.slice(0,34).padEnd(35)} ${r.type} active=${r.active}`)
if (roots.length > 20) console.log(`  … +${roots.length - 20} more`)

await c.end()
