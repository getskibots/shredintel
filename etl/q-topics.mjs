import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(`
  select lower(topic) t, count(*) n from report.intel_topics
   where bot_id=43 group by 1 order by 2 desc limit 22`)
console.log('Top recurring JH guest topics:')
for (const r of rows) console.log(`  ${String(r.n).padStart(4)}  ${r.t}`)
// negative-sentiment topics = pain points
const { rows: neg } = await c.query(`
  select lower(topic) t, count(*) n from report.intel_topics
   where bot_id=43 and sentiment='Negative' group by 1 order by 2 desc limit 10`)
console.log('\nTop NEGATIVE-sentiment topics (pain points):')
for (const r of neg) console.log(`  ${String(r.n).padStart(4)}  ${r.t}`)
await c.end()
