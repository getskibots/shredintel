#!/usr/bin/env node
/** bot-usage.mjs — read-only. Real vs test bots by actual traffic (users + conversations). */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(`
  with u as (select bot_id, count(*) users from raw.admin_user group by bot_id),
       cv as (select usr.bot_id, count(*) convs, max(c.started_at)::date last_seen
                from raw.admin_conversation c join raw.admin_user usr on usr.id = c.user_id
               group by usr.bot_id)
  select b.id, b.name, coalesce(u.users,0) users, coalesce(cv.convs,0) convs, cv.last_seen
    from raw.admin_bot b
    left join u  on u.bot_id  = b.id
    left join cv on cv.bot_id = b.id
   where b.active = 1
   order by convs desc nulls last`)

import fs from 'node:fs'
const csv = 'id,name,conversations,users,last_seen\n' +
  rows.map((r) => `${r.id},"${String(r.name).replace(/"/g, '""')}",${r.convs},${r.users},${r.last_seen || ''}`).join('\n')
fs.writeFileSync('C:/Users/Brandon/Downloads/bot_usage.csv', csv)
console.log('full ranked list written to: C:/Users/Brandon/Downloads/bot_usage.csv')

const fmt = (r) => `  #${String(r.id).padStart(4)} ${String(r.name).slice(0,34).padEnd(35)} ${String(r.convs).padStart(7)} convs  ${String(r.users).padStart(7)} users  ${r.last_seen || '—'}`

console.log('\n=== TOP 12 active bots by conversations ===')
for (const r of rows.slice(0, 12)) console.log(fmt(r))

console.log('\n=== the "test" bots you saw (for comparison) ===')
for (const r of rows.filter((r) => /test|template|demo|sandbox|playground|gnarbot|copy of/i.test(r.name)).slice(0, 12)) console.log(fmt(r))

const empty = rows.filter((r) => r.convs === 0).length
const under10 = rows.filter((r) => r.convs < 10).length
const under100 = rows.filter((r) => r.convs < 100).length
console.log(`\nof ${rows.length} active bots:`)
console.log(`  ${empty} have 0 conversations`)
console.log(`  ${under10} have < 10`)
console.log(`  ${under100} have < 100`)
console.log(`  ${rows.length - under100} have >= 100 (the real ones)`)

await c.end()
