#!/usr/bin/env node
/**
 * inspect-greeting.mjs — read-only, light touch on prod. Understand what
 * admin_widget_greeting_event actually records, so we can judge its value and
 * design a rollup (not pull 18.6M raw rows). PII-named columns are excluded
 * from the sample; only structure + cheap index-range lookups are run.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
const T = 'admin_widget_greeting_event'
const PII = /ip|phone|email|first|last|(^|_)name|agent|token|address|browser|device|url/i

const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST,
  port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER,
  password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB,
  connectTimeout: 20_000,
})

const [cols] = await conn.query(
  `SELECT COLUMN_NAME name, DATA_TYPE type, COLUMN_KEY kk, IS_NULLABLE nul
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
  [DB, T],
)

console.log(`\n─── ${T} columns ───────────────────────────────`)
for (const c of cols) {
  const pii = PII.test(c.name) ? '  ⚠️ maybe-PII (excluded from sample)' : ''
  console.log(`  ${c.name.padEnd(28)} ${c.type.padEnd(12)}${c.kk ? '[' + c.kk + '] ' : ''}${pii}`)
}

// Cheap: id range via index (proxy for volume/recency), no full scan.
const idCol = cols.find((c) => c.kk === 'PRI') || cols.find((c) => c.name === 'id')
if (idCol) {
  const [[r]] = await conn.query(`SELECT MIN(\`${idCol.name}\`) lo, MAX(\`${idCol.name}\`) hi FROM \`${T}\``)
  console.log(`\n  ${idCol.name} range: ${r.lo} … ${r.hi}`)
}

// Sample a handful of rows, safe columns only (no full scan — plain LIMIT).
const safe = cols.map((c) => c.name).filter((n) => !PII.test(n))
const [sample] = await conn.query(
  `SELECT ${safe.map((s) => '`' + s + '`').join(', ')} FROM \`${T}\` LIMIT 6`,
)
console.log(`\n─── sample rows (safe columns only) ────────────────`)
for (const row of sample) console.log('  ' + JSON.stringify(row))

await conn.end()
