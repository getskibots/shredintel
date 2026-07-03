#!/usr/bin/env node
/** raw-stats.mjs — read-only. Tables, columns (fields), and rows in raw.* */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows: [r] } = await c.query(`
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='raw' AND c.relkind='r')                                      AS tables,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='raw')        AS fields,
    (SELECT sum(c.reltuples)::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='raw' AND c.relkind='r')                                      AS rows_est`)

console.log(`\ntables (the 83 "tabs"):   ${Number(r.tables).toLocaleString()}`)
console.log(`fields (columns total):    ${Number(r.fields).toLocaleString()}`)
console.log(`rows (records total, est): ${Number(r.rows_est).toLocaleString()}`)

await c.end()
