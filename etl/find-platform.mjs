#!/usr/bin/env node
/**
 * find-platform.mjs — read-only. Locate the Voice/Chat differentiator: any
 * column named like platform/channel/medium/type, plus (for enums) the exact
 * allowed values straight from COLUMN_TYPE (no data scan), and a value
 * distribution for the real platform column.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST, port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER, password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB, connectTimeout: 20_000,
})

const [cols] = await conn.query(
  `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ct
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND (COLUMN_NAME LIKE '%platform%' OR COLUMN_NAME LIKE '%channel%'
           OR COLUMN_NAME LIKE '%medium%' OR COLUMN_NAME = 'type' OR COLUMN_NAME = 'source')
    ORDER BY TABLE_NAME, COLUMN_NAME`, [DB])

console.log('\n=== columns that could differentiate Voice vs Chat ===')
for (const r of cols) console.log(`  ${(r.t + '.' + r.c).padEnd(44)} ${r.ct}`)

// Distribution for the most likely platform column(s), on smaller/keyed tables.
const platformCols = cols.filter((r) => /platform|channel|medium/i.test(r.c))
for (const r of platformCols) {
  try {
    const [[{ n }]] = await conn.query(
      `SELECT TABLE_ROWS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`, [DB, r.t])
    if (Number(n) > 2_000_000) { console.log(`\n${r.t}.${r.c}: ${Number(n).toLocaleString()} rows — skipping full scan (enum values above if any)`); continue }
    const [vals] = await conn.query(`SELECT \`${r.c}\` v, COUNT(*) c FROM \`${r.t}\` GROUP BY \`${r.c}\` ORDER BY c DESC`)
    console.log(`\n${r.t}.${r.c} distribution:`)
    for (const v of vals) console.log(`    ${String(v.v).padEnd(16)} ${Number(v.c).toLocaleString()}`)
  } catch (e) { console.log(`\n${r.t}.${r.c}: ${e.message.split('\n')[0]}`) }
}

// admin_bot.type — the bot-level channel (2=MC chat, 43=JH chat, 248=MC voice)
try {
  const [bt] = await conn.query(
    `SELECT type, COUNT(*) c FROM admin_bot GROUP BY type ORDER BY c DESC`)
  console.log('\n=== admin_bot.type (bot-level channel) ===')
  for (const r of bt) console.log(`    ${String(r.type).padEnd(16)} ${r.c} bots`)
} catch (e) { console.log('\nadmin_bot.type:', e.message.split('\n')[0]) }

await conn.end()
