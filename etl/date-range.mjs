#!/usr/bin/env node
/**
 * date-range.mjs — read-only, low-load. Earliest/latest record per key table,
 * using PK index seeks (ORDER BY id LIMIT 1) so it never full-scans.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
// [table, dateColumn, pkColumn]
const CHECKS = [
  ['admin_widget_greeting_event', 'timestamp', 'id'],
  ['admin_chat_history', 'timestamp', 'id'],
  ['admin_conversation', 'started_at', 'id'],
  ['admin_knowledge_reply', 'sent_at', 'id'],
  ['admin_nlp_request', 'created_date_time', 'id'],
  ['admin_api_call_history', 'sent_at', 'id'],
  ['admin_user', 'created_at', 'id'],
]

const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST, port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER, password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB, connectTimeout: 20_000,
})

const iso = (d) => (d && d.toISOString ? d.toISOString().slice(0, 10) : String(d))
console.log(`\n${'table'.padEnd(30)} ${'earliest'.padEnd(12)} latest`)
console.log('─'.repeat(56))
for (const [t, c, pk] of CHECKS) {
  try {
    const [[lo]] = await conn.query(`SELECT \`${c}\` d FROM \`${t}\` ORDER BY \`${pk}\` ASC LIMIT 1`)
    const [[hi]] = await conn.query(`SELECT \`${c}\` d FROM \`${t}\` ORDER BY \`${pk}\` DESC LIMIT 1`)
    console.log(`${t.padEnd(30)} ${iso(lo?.d).padEnd(12)} ${iso(hi?.d)}`)
  } catch (e) { console.log(`${t.padEnd(30)} (skip: ${e.message.split('\n')[0]})`) }
}
await conn.end()
