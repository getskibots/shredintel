#!/usr/bin/env node
/** inspect-knowledge.mjs — read-only. Find where the resort knowledge SECTIONS
 *  + entries + enabled flags live in the mirror, keyed to a bot (43=JH), so we
 *  can auto-join guest demand ↔ KB coverage. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('=== candidate raw tables (knowledge/section/atom/entry/category) ===')
const { rows: tbls } = await c.query(`
  select t.table_name,
         (select count(*) from information_schema.columns col where col.table_schema='raw' and col.table_name=t.table_name) cols
    from information_schema.tables t
   where t.table_schema='raw'
     and t.table_name ~* 'knowledge|section|atom|entry|categor|preset|topic'
   order by 1`)
for (const r of tbls) console.log(`  raw.${r.table_name}  (${r.cols} cols)`)

// inspect the most promising ones: columns + does it carry bot_id + a name/title + enabled flag?
for (const t of tbls) {
  const { rows: cols } = await c.query(`
    select column_name, data_type from information_schema.columns
     where table_schema='raw' and table_name=$1 order by ordinal_position`, [t.table_name])
  const names = cols.map((x) => x.column_name)
  const hasBot = names.some((n) => /bot/i.test(n))
  const hasName = names.some((n) => /name|title|label|section/i.test(n))
  const hasEnabled = names.some((n) => /enabl|active|visible|disabled|status/i.test(n))
  if (hasBot && (hasName || hasEnabled)) {
    console.log(`\n--- raw.${t.table_name}: cols = ${names.join(', ')}`)
    try {
      const { rows: cnt } = await c.query(`select count(*) n from raw.${t.table_name}`)
      console.log(`    rows: ${cnt[0].n}`)
      const botCol = names.find((n) => /^bot_id$/i.test(n)) || names.find((n) => /bot/i.test(n))
      if (botCol) {
        const { rows: bc } = await c.query(`select count(*) n from raw.${t.table_name} where "${botCol}"=43`)
        console.log(`    rows for bot 43 (via ${botCol}): ${bc[0].n}`)
      }
    } catch (e) { console.log('    err:', e.message.split('\n')[0]) }
  }
}

await c.end()
console.log('\ndone.')
