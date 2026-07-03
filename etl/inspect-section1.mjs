#!/usr/bin/env node
/**
 * inspect-section1.mjs — read-only schema recon for the "Extended Conversation
 * Counts" report section. Maps sender/direction + timestamp fields on
 * raw.admin_conversation + raw.admin_chat_history so we can build accurate
 * sessions/messages metrics.
 *
 * PII-safe: prints column lists + LOW-cardinality categorical distributions
 * only. Any column with >25 distinct values is treated as an identifier and
 * skipped (never dumps message text, phones, emails, or user ids).
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const cols = async (table) => (await c.query(
  `select column_name, data_type from information_schema.columns
     where table_schema='raw' and table_name=$1 order by ordinal_position`, [table])).rows

const CAT = /type|sender|direction|role|bot|author|from|to|channel|status|support|agent|is_|kind|source|actor|origin/i

async function probe(table) {
  const cs = await cols(table)
  console.log(`\n=== raw.${table} — ${cs.length} columns ===`)
  for (const r of cs) console.log(`  ${r.column_name.padEnd(34)} ${r.data_type}`)

  const tsCol = cs.find((r) => /created|time|date|sent|updated/i.test(r.column_name)
    && /time|date/i.test(r.data_type))?.column_name
  const idCol = cs.find((r) => r.column_name === 'id')?.column_name
  console.log(`  → timestamp col: ${tsCol || '(none found)'}`)

  // recent window keeps probes fast on the big tables
  const where = tsCol ? `where "${tsCol}" >= now() - interval '60 days'` : ''
  const cands = cs.filter((r) => CAT.test(r.column_name))
  console.log(`\n  -- categorical distributions (last 60d${tsCol ? '' : ', full'}) --`)
  for (const col of cands) {
    try {
      const { rows: [{ n }] } = await c.query(
        `select count(distinct "${col.column_name}") n from raw.${table} ${where}`)
      if (Number(n) > 25) {
        console.log(`  ${col.column_name}: ${n} distinct — skipped (identifier/PII)`) ; continue
      }
      const { rows } = await c.query(
        `select "${col.column_name}"::text v, count(*) c from raw.${table} ${where}
           group by 1 order by 2 desc limit 12`)
      console.log(`  ${col.column_name} (${col.data_type}) — ${n} distinct:`)
      for (const r of rows) console.log(`      ${String(r.v ?? 'NULL').slice(0, 40).padEnd(42)} ${r.c}`)
    } catch (e) { console.log(`  ${col.column_name}: ${e.message.split('\n')[0]}`) }
  }
  return { tsCol, idCol, cs }
}

const conv = await probe('admin_conversation')
const ch = await probe('admin_chat_history')

// how does a message tie to a bot + its conversation?
console.log('\n=== linkage ===')
console.log('  chat_history link cols :', ch.cs.filter((r) => /bot|conversation|user/i.test(r.column_name)).map((r) => r.column_name).join(', ') || '(none)')
console.log('  conversation link cols :', conv.cs.filter((r) => /bot|user/i.test(r.column_name)).map((r) => r.column_name).join(', ') || '(none)')

// volume sanity for one real bot (bot 2 = Mountain Collective)
try {
  const botCol = ch.cs.find((r) => /^bot_id$/i.test(r.column_name))?.column_name
  if (botCol) {
    const { rows: [v] } = await c.query(
      `select count(*) msgs from raw.admin_chat_history where "${botCol}"=2 and "${ch.tsCol}" >= now() - interval '30 days'`)
    console.log(`  bot 2 messages (30d): ${v.msgs}`)
  }
} catch (e) { console.log('  bot volume probe:', e.message.split('\n')[0]) }

await c.end()
console.log('\ndone.')
