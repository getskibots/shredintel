#!/usr/bin/env node
/**
 * rebuild.mjs — rebuild the report.* matviews derived from report.conversation_intel
 * so newly enriched bots (from enrich.mjs) light up across the dashboard.
 *
 * Runs the build-*.mjs scripts in DEPENDENCY ORDER. Critical: page-funnel BEFORE
 * conversation-time — conversation_time JOINS conversation_page, and page-funnel
 * does DROP MATERIALIZED VIEW conversation_page CASCADE (which would drop
 * conversation_time if it were built first).
 *
 * The raw-based matviews (outcome_timeline, conversion_pulse, sender_mix_stack,
 * lead_capture_funnel, demand_heatmap) DON'T change with enrichment, so they're not
 * touched here. Pass --refresh to also run sync.mjs --refresh-only (slower, nightly-style).
 *
 * Prod writes → run from etl/ (reads DB creds from etl/.env; no MySQL needed).
 *
 *   node rebuild.mjs             # rebuild enrichment-derived matviews (incl heavy IP/geo)
 *   node rebuild.mjs --fast      # skip the heavy IP/geo pass (use when ip-geo is already current)
 *   node rebuild.mjs --refresh   # also REFRESH the raw-based matviews (adds several min)
 *   node rebuild.mjs --only page-funnel,conversation-time
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const FAST = args.includes('--fast')
const REFRESH = args.includes('--refresh')
const onlyIdx = args.indexOf('--only')
const ONLY = onlyIdx >= 0 && args[onlyIdx + 1] ? args[onlyIdx + 1].split(',').map((s) => s.trim()) : null

// DEPENDENCY ORDER. `heavy` → skipped by --fast. `optIn` → only runs with --refresh.
const STEPS = [
  { name: 'bot-timezone',       script: 'build-bot-timezone.mjs' },        // tz map → correct resort-local day
  { name: 'ip-geo',             script: 'build-ip-geo.mjs', heavy: true }, // 382k IP offline enrich (needs etl/geoip/)
  { name: 'page-funnel',        script: 'build-page-funnel.mjs' },         // conversation_page — MUST precede conversation-time
  { name: 'conversation-time',  script: 'build-conversation-time.mjs' },   // drill spine; JOINS conversation_page + bot_timezone + ip_geo
  { name: 'geo-views',          script: 'build-geo-views.mjs' },           // conversation_geo (ip_geo + conversation_intel)
  { name: 'knowledge-layer',    script: 'build-knowledge-layer.mjs' },     // answer-source mix by section
  { name: 'conversation-depth', script: 'build-conversation-depth.mjs' },  // §1 extended counts
  { name: 'intel-views',        script: 'build-intel-views.mjs' },         // §2/§3 plain views (cheap; ensures current)
  { name: 'refresh',            script: 'sync.mjs', scriptArgs: ['--refresh-only'], optIn: true }, // raw matviews; --refresh only
]

const run = STEPS.filter((s) => {
  if (ONLY) return ONLY.includes(s.name)
  if (s.optIn && !REFRESH) return false
  if (FAST && s.heavy) return false
  return true
})

console.log(`rebuild → ${run.map((s) => s.name).join(' · ')}\n`)
const results = []
for (const step of run) {
  const label = `${step.script}${step.scriptArgs ? ' ' + step.scriptArgs.join(' ') : ''}`
  console.log(`\n━━━━━ ${step.name}  (${label}) ━━━━━`)
  const t = Date.now()
  const r = spawnSync(process.execPath, [join(DIR, step.script), ...(step.scriptArgs || [])], { cwd: DIR, stdio: 'inherit' })
  const ok = r.status === 0 && !r.error
  const sec = ((Date.now() - t) / 1000).toFixed(0)
  results.push({ name: step.name, ok, sec })
  console.log(`  ${ok ? '✓' : '✗ FAILED'} ${step.name} — ${sec}s`)
}

console.log('\n── rebuild summary ──')
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(20)} ${r.sec.padStart(4)}s`)
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log(`\n⚠ ${failed.length} step(s) failed: ${failed.map((f) => f.name).join(', ')}`)
  console.log(`  (ip-geo needs the offline MaxMind DB in etl/geoip/ — use --fast to skip it.)`)
  console.log(`  re-run a single step: node rebuild.mjs --only <name>`)
  process.exit(1)
}
console.log(`\n✓ enrichment-derived views rebuilt — newly enriched bots are live across the panels.${REFRESH ? ' (raw matviews refreshed too.)' : ''}`)
