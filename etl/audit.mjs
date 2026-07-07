#!/usr/bin/env node
/**
 * audit.mjs — data-accuracy reconciliation harness. For each bot it computes every
 * key metric TWO ways — from the report layer (what the dashboard reads) AND
 * independently from raw.* — plus internal invariants, and prints a pass/fail
 * scorecard. Read-only. Re-run after every sync/enrichment as a trust check.
 *
 *   node audit.mjs [botId ...]        (default: 43 17)
 */
import 'dotenv/config'
import pg from 'pg'

const BOTS = process.argv.slice(2).map(Number).filter(Boolean)
const TARGETS = BOTS.length ? BOTS : [43, 17]

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='600000ms'")  // raw engaged-EXISTS scan is slow on big bots

const num = async (sql, p = []) => {
  try { const r = await c.query(sql, p); return Number(Object.values(r.rows[0])[0]) } catch { return null }
}
const pct = (a, b) => (b > 0 ? (100 * a / b).toFixed(1) + '%' : '—')
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol * Math.max(a, b, 1)

let passAll = 0, failAll = 0
for (const bot of TARGETS) {
  const name = (await c.query(`select name from public.bots where id=$1`, [bot])).rows[0]?.name || `bot ${bot}`
  console.log(`\n${'═'.repeat(60)}\n  BOT ${bot} — ${name}\n${'═'.repeat(60)}`)

  // ── report-layer values (what the dashboard reads; all fast matview/view reads) ──
  const depthTotal   = await num(`select coalesce(sum(conversations),0) from report.conversation_depth where bot_id=$1`, [bot])
  const depthEngaged = await num(`select coalesce(sum(engaged_conversations),0) from report.conversation_depth where bot_id=$1`, [bot])
  const enriched     = await num(`select count(*) from report.conversation_intel where bot_id=$1`, [bot])
  const substantive  = await num(`select count(*) from report.conversation_intel where bot_id=$1 and substantive`, [bot])
  const sectionSum   = await num(`select coalesce(sum(conversations),0) from report.intel_section where bot_id=$1`, [bot])
  const sentimentSum = await num(`select coalesce(sum(conversations),0) from report.intel_sentiment where bot_id=$1`, [bot])
  const categorySum  = await num(`select coalesce(sum(conversations),0) from report.intel_category where bot_id=$1`, [bot])
  const cTime        = await num(`select count(*) from report.conversation_time where bot_id=$1`, [bot])
  const cGeo         = await num(`select count(*) from report.conversation_geo where bot_id=$1`, [bot])
  const cPage        = await num(`select count(*) from report.conversation_page where bot_id=$1`, [bot])
  const geoLocated   = await num(`select count(*) filter (where city is not null) from report.conversation_geo where bot_id=$1`, [bot])

  // ── independent recompute straight from raw.* (ground truth) ──
  const rawTotal   = await num(`select count(*) from raw.admin_conversation cv join raw.admin_user u on u.id=cv.user_id where u.bot_id=$1 and cv.started_at >= '2024-10-01'`, [bot])
  const rawEngaged = await num(`select count(*) from raw.admin_conversation cv join raw.admin_user u on u.id=cv.user_id and u.bot_id=$1
     where cv.started_at >= '2024-10-01' and exists (select 1 from raw.admin_chat_history h
       where h.conversation_id=cv.id and coalesce(h.is_message,1)=1 and coalesce(h.is_echo,false)=false
         and coalesce(h.is_from_support,0)=0 and coalesce(h.visible,1)=1)`, [bot])

  const checks = [
    ['Total convs · report == raw',           depthTotal,   rawTotal,    depthTotal === rawTotal],
    ['Engaged · report(depth) ≈ raw',         depthEngaged, rawEngaged,  near(depthEngaged, rawEngaged, 0.02)],
    ['Enriched == engaged (backfill done)',   enriched,     rawEngaged,  near(enriched, rawEngaged, 0.02)],
    ['Invariant · total ≥ engaged ≥ subst',   `${rawTotal} ≥ ${depthEngaged} ≥ ${substantive}`, '', rawTotal >= depthEngaged && depthEngaged >= substantive],
    ['Section counts sum == substantive',     sectionSum,   substantive, sectionSum === substantive],
    ['Sentiment counts sum == substantive',   sentimentSum, substantive, sentimentSum === substantive],
    ['Category counts sum == substantive',    categorySum,  substantive, categorySum === substantive],
    ['conversation_time == enriched',         cTime,        enriched,    cTime === enriched],
    ['conversation_geo ≤ enriched (has IP)',  cGeo,         enriched,    cGeo != null && enriched != null && cGeo <= enriched],
    ['conversation_page ≤ enriched',          cPage,        enriched,    cPage != null && enriched != null && cPage <= enriched],
  ]
  let pass = 0
  for (const [label, a, b, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${label.padEnd(38)} ${a}${b !== '' ? `  vs  ${b}` : ''}`)
    ok ? pass++ : null
  }
  passAll += pass; failAll += checks.length - pass

  // ── informational (not pass/fail) ──
  const dayRange = (await c.query(`select min(day)::text lo, max(day)::text hi from report.conversation_intel where bot_id=$1`, [bot])).rows[0]
  const topC = (await c.query(`select country_iso, count(*)::int n from report.conversation_geo where bot_id=$1 and substantive and country_iso is not null group by country_iso order by n desc limit 5`, [bot])).rows
    .map(r => `${r.country_iso} ${r.n}`).join(' · ')
  const dcJunk = await num(`select count(*) filter (where is_datacenter) from report.conversation_geo where bot_id=$1 and substantive`, [bot])
  const subGeo = await num(`select count(*) from report.conversation_geo where bot_id=$1 and substantive`, [bot])
  console.log(`  ── info · substantive=${substantive} (${pct(substantive, enriched)} of enriched) · geo located ${pct(geoLocated, cGeo)} · datacenter/junk ${pct(dcJunk, subGeo)} of substantive · page-attributed ${pct(cPage, enriched)}`)
  console.log(`  ── info · days ${dayRange?.lo} → ${dayRange?.hi} · top countries: ${topC}`)
  console.log(`\n  ${pass}/${checks.length} checks passed`)
}

console.log(`\n${'═'.repeat(60)}\n  OVERALL: ${passAll} passed · ${failAll} failed across ${TARGETS.length} bots\n${'═'.repeat(60)}`)
await c.end()
