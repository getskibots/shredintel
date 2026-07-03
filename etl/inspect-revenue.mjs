import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port:+(process.env.SUPABASE_DB_PORT||5432), user:process.env.SUPABASE_DB_USER, password:process.env.SUPABASE_DB_PASSWORD, database:process.env.SUPABASE_DB_NAME||'postgres', ssl:{rejectUnauthorized:false} })
await c.connect()

console.log('=== money/order columns anywhere in raw.* ===')
const { rows: cols } = await c.query(`
  select table_name, column_name, data_type from information_schema.columns
   where table_schema='raw' and column_name ~* 'amount|price|revenue|subtotal|_total|order_id|paid|checkout|cart|sku'
   order by 1,2 limit 40`)
if (!cols.length) console.log('  (none found)')
for (const r of cols) console.log(`  raw.${r.table_name}.${r.column_name} (${r.data_type})`)

console.log('\n=== order/transaction/payment tables ===')
const { rows: tbls } = await c.query(`
  select table_name from information_schema.tables
   where table_schema='raw' and table_name ~* 'order|transaction|purchase|payment|cart|checkout|sale|revenue'
   order by 1`)
if (!tbls.length) console.log('  (none found)')
for (const r of tbls) console.log(`  raw.${r.table_name}`)

console.log('\n=== conversion SIGNAL we do have (bot 43) ===')
const { rows: [cv] } = await c.query(`
  select sum(converted_conversations) converted, sum(total_conversations) total,
         min(day) since, max(day) thru
    from report.conversion_pulse where bot_id=43`)
console.log(`  all-time: ${cv.converted} converted conversations of ${cv.total} total (${cv.since?.toISOString?.().slice(0,10)}→${cv.thru?.toISOString?.().slice(0,10)})`)
const { rows: [cv30] } = await c.query(`select sum(converted_conversations) n from report.conversion_pulse where bot_id=43 and day >= current_date-30`)
console.log(`  last 30d: ${cv30.n} converted conversations`)
await c.end()
