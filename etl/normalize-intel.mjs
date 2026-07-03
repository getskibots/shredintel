#!/usr/bin/env node
/** normalize-intel.mjs — snap any off-spine category labels back onto the 12
 *  canonical spine values (the LLM occasionally emits a near-synonym). */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const SPINE = new Set([
  'Booking / Reservations', 'Pricing & Availability', 'Payments / Billing',
  'Refunds / Cancellations', 'Policies & Rules', 'Account / Access',
  'Technical Problems', 'Product / Service Info', 'Complaints / Service Issues',
  'Human / Escalation', 'Emergency / Safety', 'Other',
])
// explicit maps for observed drift; anything else off-spine → Other
const MAP = {
  'Reservations': 'Booking / Reservations',
  'Booking': 'Booking / Reservations',
  'Pricing': 'Pricing & Availability',
  'Availability': 'Pricing & Availability',
  'Billing': 'Payments / Billing',
  'Payments': 'Payments / Billing',
  'Refunds': 'Refunds / Cancellations',
  'Cancellations': 'Refunds / Cancellations',
  'Policies': 'Policies & Rules',
  'Account': 'Account / Access',
  'Access': 'Account / Access',
  'Technical': 'Technical Problems',
  'Complaints': 'Complaints / Service Issues',
  'Escalation': 'Human / Escalation',
  'Human': 'Human / Escalation',
  'Emergency': 'Emergency / Safety',
}

const { rows: cats } = await c.query(
  `select category, count(*) n from report.conversation_intel group by 1 order by 2 desc`)
const off = cats.filter((r) => !SPINE.has(r.category))
console.log('off-spine labels:', off.length ? off.map((r) => `${r.category}=${r.n}`).join(', ') : '(none)')

let fixed = 0
for (const r of off) {
  const target = MAP[r.category] || 'Other'
  const res = await c.query(`update report.conversation_intel set category=$1 where category=$2`, [target, r.category])
  console.log(`  ${r.category} → ${target}  (${res.rowCount})`)
  fixed += res.rowCount
}
console.log(`normalized ${fixed} rows`)

// final canonical breakdown for JH
const { rows: final } = await c.query(`
  select category, count(*) n from report.conversation_intel
   where bot_id=43 and substantive group by 1 order by 2 desc`)
console.log('\nJH canonical category breakdown (substantive):')
const tot = final.reduce((s, r) => s + Number(r.n), 0)
for (const r of final) console.log(`  ${String(r.category).padEnd(28)} ${String(r.n).padStart(5)}  ${(100*r.n/tot).toFixed(1)}%`)

await c.end()
console.log('\ndone.')
