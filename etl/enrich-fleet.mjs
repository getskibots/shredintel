#!/usr/bin/env node
/**
 * enrich-fleet.mjs — enrich EVERY bot in the fleet that has un-enriched engaged
 * conversations, biggest-backlog-first. DB-driven (no hardcoded list): supersedes
 * enrich-all.mjs, which only covered 31 ski bots. Runs `node enrich.mjs <id>` per
 * bot in sequence. Fully resumable — enrich.mjs skips already-enriched convs, so you
 * can stop (Ctrl-C / kill) and re-run this any time and it continues where it left off.
 *
 *   node enrich-fleet.mjs             # all bots with pending work, largest first
 *   node enrich-fleet.mjs --min 50    # skip bots with < 50 pending convs (tail trim)
 *
 * When it finishes:  node rebuild.mjs --fast   (or the nightly refresh picks it up)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import 'dotenv/config'
import pg from 'pg'

const DIR = dirname(fileURLToPath(import.meta.url))
const MIN = (() => { const i = process.argv.indexOf('--min'); return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0 })()

// Pick the work list from the DB: every bot whose (conversations since the 2024-10-01
// floor) exceeds what's already in report.conversation_intel. This gap is only used to
// ORDER + skip clearly-finished bots; enrich.mjs does the exact engaged/not-enriched
// filtering per bot (a bot whose gap is all greeting-only convs just finds 0 work fast).
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: +(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='150000ms'")
const totals = (await c.query(`select u.bot_id, count(*)::int total
  from raw.admin_conversation cv join raw.admin_user u on u.id = cv.user_id
  where cv.started_at >= '2024-10-01' group by u.bot_id`)).rows
const done = new Map((await c.query('select bot_id, count(*)::int n from report.conversation_intel group by bot_id'))
  .rows.map((r) => [Number(r.bot_id), r.n]))
await c.end()

const BOTS = totals
  .map((t) => ({ id: Number(t.bot_id), gap: Math.max(0, t.total - (done.get(Number(t.bot_id)) || 0)) }))
  .filter((b) => b.gap > MIN)
  .sort((a, b) => b.gap - a.gap)
  .map((b) => b.id)

console.log(`Fleet enrichment · ${BOTS.length} bots with pending work${MIN ? ` (min ${MIN})` : ''} · biggest backlog first.`)
console.log('Resumable — safe to stop and re-run.\n')
const t0 = Date.now()
let i = 0, hadError = false
for (const id of BOTS) {
  i++
  console.log(`\n════════════ [${i}/${BOTS.length}]  bot ${id} ════════════`)
  const r = spawnSync(process.execPath, [join(DIR, 'enrich.mjs'), String(id)], { cwd: DIR, stdio: 'inherit' })
  if (r.status !== 0 || r.error) { hadError = true; console.log(`  ⚠ bot ${id} didn't finish cleanly — continuing; re-run enrich-fleet.mjs later to retry it.`) }
}
const mins = ((Date.now() - t0) / 60000).toFixed(0)
console.log(`\n${'═'.repeat(48)}`)
console.log(`✓ Fleet done — ${BOTS.length} bots processed in ~${mins} min.${hadError ? ' (Some had hiccups — a re-run will finish them.)' : ''}`)
console.log('\n👉 Next: node rebuild.mjs --fast   (or let the nightly refresh pick it up)')
