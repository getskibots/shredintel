import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: +(process.env.SUPABASE_DB_PORT||5432), user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD, database: process.env.SUPABASE_DB_NAME||'postgres', ssl:{rejectUnauthorized:false} })
await c.connect()
const { rows } = await c.query(`select key, sum(conversations) n, sum(negative) neg from report.intel_pinchpoint where bot_id=43 group by key order by n desc`)
const tot = rows.reduce((s,r)=>s+Number(r.n),0)
console.log(`Ecommerce conversion blockers (JH) — ${tot} conversations hit a pinchpoint:`)
for (const r of rows) console.log(`  ${String(r.key).padEnd(16)} ${String(r.n).padStart(5)}  (${r.neg} negative)`)
await c.end()
