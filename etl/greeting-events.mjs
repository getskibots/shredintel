#!/usr/bin/env node
/**
 * greeting-events.mjs — read-only, cheap. What event types exist, and how big
 * would a daily rollup be vs the 2.65 GB of raw rows? Uses PK-bounded scans so
 * we don't full-scan 23.8M rows on prod.
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'

const DB = process.env.BOTSCREW_MYSQL_DATABASE
const conn = await mysql.createConnection({
  host: process.env.BOTSCREW_MYSQL_HOST,
  port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
  user: process.env.BOTSCREW_MYSQL_USER,
  password: process.env.BOTSCREW_MYSQL_PASSWORD,
  database: DB,
  connectTimeout: 20_000,
})

// Event-type distribution over the most recent 300k rows (walks the PK index
// backward — cheap, no full scan). Tells us if it's impressions-only or a funnel.
const [dist] = await conn.query(
  `SELECT event, COUNT(*) c
     FROM (SELECT event FROM admin_widget_greeting_event ORDER BY id DESC LIMIT 300000) t
    GROUP BY event ORDER BY c DESC`,
)
console.log('─── event types (recent 300k rows) ────────────────')
for (const r of dist) console.log(`  ${String(r.event).padEnd(14)} ${Number(r.c).toLocaleString()}`)

// How many distinct (user_id IS NOT NULL) — i.e., attributable to a known user
const [[anon]] = await conn.query(
  `SELECT SUM(user_id IS NULL) anon, SUM(user_id IS NOT NULL) known
     FROM (SELECT user_id FROM admin_widget_greeting_event ORDER BY id DESC LIMIT 300000) t`,
)
console.log(`\n  of recent 300k: ${Number(anon.anon).toLocaleString()} anonymous (user_id null), ${Number(anon.known).toLocaleString()} tied to a known user`)

// Rollup-size proxy: distinct days in recent 300k, and full date span.
const [[span]] = await conn.query(
  `SELECT MIN(timestamp) lo, MAX(timestamp) hi FROM (SELECT timestamp FROM admin_widget_greeting_event ORDER BY id DESC LIMIT 300000) t`,
)
console.log(`\n  recent 300k spans: ${span.lo?.toISOString?.() || span.lo}  →  ${span.hi?.toISOString?.() || span.hi}`)

await conn.end()
