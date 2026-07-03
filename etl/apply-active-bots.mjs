#!/usr/bin/env node
/** apply-active-bots.mjs — rebuild public.bots to ACTIVE bots only (active=1). */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const before = (await c.query('select count(*) n from public.bots')).rows[0].n
const del = await c.query(
  `delete from public.bots where id not in (select id from raw.admin_bot where active = 1)`)
await c.query(
  `insert into public.bots (id, name)
   select id, coalesce(nullif(trim(name),''),'Bot '||id) from raw.admin_bot where active = 1
   on conflict (id) do update set name = excluded.name, synced_at = now()`)
const after = (await c.query('select count(*) n from public.bots')).rows[0].n

console.log(`public.bots: ${before} → ${after}  (removed ${del.rowCount} inactive)`)
await c.end()
