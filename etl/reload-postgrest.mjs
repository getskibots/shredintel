#!/usr/bin/env node
/** reload-postgrest.mjs — tell Supabase's PostgREST to reload its schema cache
 *  so a newly-created view/matview becomes reachable via the REST API. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(`notify pgrst, 'reload schema'`)
console.log("✓ sent NOTIFY pgrst 'reload schema'")
await c.end()
