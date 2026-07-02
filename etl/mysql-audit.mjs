#!/usr/bin/env node
/**
 * mysql-audit.mjs — read-only. Reports every table in the Botscrew MySQL with
 * row count + on-disk size, flags which we already sync, and totals it up so
 * we can decide "pull everything?" on real numbers.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { TABLES } from './tables.mjs'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
const synced = new Set(TABLES.map((t) => t.name))

const fmt = (n) => {
  n = Number(n)
  if (n < 1024 ** 2) return (n / 1024).toFixed(0) + ' KB'
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}

const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST,
  port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER,
  password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB,
  connectTimeout: 20_000,
})

const [rows] = await conn.query(
  `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_count,
          (DATA_LENGTH + INDEX_LENGTH) AS total
     FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`,
  [DB],
)

let grand = 0, syncedTotal = 0, syncedRows = 0, grandRows = 0
console.log(`\n${'table'.padEnd(36)} ${'rows'.padStart(12)}  ${'size'.padStart(9)}  synced?`)
console.log('─'.repeat(74))
for (const r of rows) {
  grand += Number(r.total); grandRows += Number(r.row_count)
  const s = synced.has(r.name)
  if (s) { syncedTotal += Number(r.total); syncedRows += Number(r.row_count) }
  console.log(`${r.name.padEnd(36)} ${String(r.row_count).padStart(12)}  ${fmt(r.total).padStart(9)}  ${s ? '✓' : ''}`)
}
console.log('─'.repeat(74))
console.log(`tables: ${rows.length}`)
console.log(`TOTAL all tables:   ${fmt(grand).padStart(9)}   (${grandRows.toLocaleString()} rows est.)`)
console.log(`currently synced:   ${fmt(syncedTotal).padStart(9)}   (${syncedRows.toLocaleString()} rows)`)
console.log(`NOT synced (delta): ${fmt(grand - syncedTotal).padStart(9)}   (${(grandRows - syncedRows).toLocaleString()} rows)`)

await conn.end()
