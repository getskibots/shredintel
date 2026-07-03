#!/usr/bin/env node
/** db-size.mjs — read-only. Total DB size + per-schema + biggest objects. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows: [t] } = await c.query(
  `SELECT pg_size_pretty(pg_database_size(current_database())) AS total`)
console.log(`\nTOTAL DATABASE SIZE: ${t.total}\n`)

const { rows: schemas } = await c.query(`
  SELECT n.nspname AS schema,
         pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS size,
         count(*) AS objects
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','m') AND n.nspname IN ('raw','report','public')
   GROUP BY n.nspname ORDER BY sum(pg_total_relation_size(c.oid)) DESC`)
console.log('by schema:')
for (const s of schemas) console.log(`  ${s.schema.padEnd(8)} ${String(s.size).padStart(9)}  (${s.objects} objects)`)

const { rows: top } = await c.query(`
  SELECT n.nspname||'.'||c.relname AS rel, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','m') AND n.nspname IN ('raw','report','public')
   ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`)
console.log('\nbiggest objects:')
for (const r of top) console.log(`  ${r.rel.padEnd(38)} ${String(r.size).padStart(9)}`)

await c.end()
