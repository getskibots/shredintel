import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port:+(process.env.SUPABASE_DB_PORT||5432), user:process.env.SUPABASE_DB_USER, password:process.env.SUPABASE_DB_PASSWORD, database:process.env.SUPABASE_DB_NAME||'postgres', ssl:{rejectUnauthorized:false} })
await c.connect()
await c.query('set role anon')
for (const v of ['intel_section','intel_pinchpoint','intel_sentiment']) {
  const { rows } = await c.query(`select count(*) rows, sum(conversations) convs from report.${v} where bot_id=43 and day between (current_date-30) and current_date`)
  console.log(`  anon read report.${v} (bot43,30d): rows=${rows[0].rows} convs=${rows[0].convs}`)
}
await c.query('reset role')
await c.end()
console.log('anon can read all 3 intel views ✓')
