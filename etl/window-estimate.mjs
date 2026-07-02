#!/usr/bin/env node
/**
 * window-estimate.mjs — read-only. For each big time-series table, how many
 * rows fall on/after a cutoff date, so we can size a "full mirror but only ~1yr
 * of history" plan. Usage: node window-estimate.mjs 2025-07-01
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
const CUTOFF = process.argv[2] || '2025-07-01'
const BIG = [
  'admin_chat_history', 'admin_widget_greeting_event', 'admin_attribute_user_value',
  'admin_api_call_history', 'admin_support_chat_info', 'admin_knowledge_reply',
  'admin_user', 'admin_conversation', 'admin_nlp_request', 'admin_call',
]
const PREF = ['created_at', 'timestamp', 'started_at', 'date_time', 'create_date', 'created', 'date', 'updated_at']
const fmt = (n) => { n = Number(n); if (n < 1024 ** 2) return (n / 1024).toFixed(0) + 'KB'; if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(0) + 'MB'; return (n / 1024 ** 3).toFixed(2) + 'GB' }

const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST, port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER, password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB, connectTimeout: 20_000,
})

console.log(`\ncutoff = ${CUTOFF} (keep rows on/after this date)\n`)
console.log(`${'table'.padEnd(30)} ${'datecol'.padEnd(12)} ${'total'.padStart(11)} ${'kept'.padStart(11)}  keep%   full→windowed`)
console.log('─'.repeat(96))
let fullBytes = 0, keptBytes = 0
for (const t of BIG) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND DATA_TYPE IN ('datetime','timestamp','date')`, [DB, t])
  const names = cols.map((c) => c.n)
  const dc = PREF.find((p) => names.includes(p)) || names[0]
  const [[meta]] = await conn.query(
    `SELECT TABLE_ROWS r, DATA_LENGTH+INDEX_LENGTH b FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`, [DB, t])
  const total = Number(meta.r), bytes = Number(meta.b)
  fullBytes += bytes
  if (!dc) { console.log(`${t.padEnd(30)} ${'(none)'.padEnd(12)} ${String(total).padStart(11)} ${'—'.padStart(11)}  full mirror (no date col)`); keptBytes += bytes; continue }
  const [[c]] = await conn.query(`SELECT COUNT(*) c FROM \`${t}\` WHERE \`${dc}\` >= ?`, [CUTOFF])
  const kept = Number(c.c)
  const pct = total ? kept / total : 1
  const kb = bytes * pct
  keptBytes += kb
  console.log(`${t.padEnd(30)} ${dc.padEnd(12)} ${String(total).padStart(11)} ${String(kept).padStart(11)}  ${(pct * 100).toFixed(0).padStart(4)}%   ${fmt(bytes)} → ${fmt(kb)}`)
}
console.log('─'.repeat(96))
console.log(`big-table total:  ${fmt(fullBytes)}  →  windowed ~${fmt(keptBytes)}   (saves ~${fmt(fullBytes - keptBytes)})`)
await conn.end()
