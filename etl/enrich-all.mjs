#!/usr/bin/env node
/**
 * enrich-all.mjs — enrich EVERY active ski/leisure chat bot, one after another.
 * Just runs `node enrich.mjs <id>` for each bot in sequence, so you don't need a
 * shell loop. Resumable: already-enriched bots (43 JH, 17 Diamond Peak) find 0
 * work and skip in seconds, and if it stops you can re-run this and it picks up
 * where it left off.
 *
 *   node enrich-all.mjs
 *
 * When it finishes, run:  node rebuild.mjs --fast
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
// The 31 active ski/leisure CHAT bots (voice lines + Copy + SBT-GRVL excluded).
const BOTS = [90, 103, 16, 2, 277, 23, 17, 190, 152, 142, 171, 60, 200, 137, 228,
  263, 275, 136, 189, 101, 166, 254, 65, 69, 364, 76, 55, 258, 1, 143, 311]

console.log(`Enriching ${BOTS.length} bots in sequence. Resumable — safe to stop and re-run.\n`)
const t0 = Date.now()
let i = 0, hadError = false
for (const id of BOTS) {
  i++
  console.log(`\n════════════ [${i}/${BOTS.length}]  bot ${id} ════════════`)
  const r = spawnSync(process.execPath, [join(DIR, 'enrich.mjs'), String(id)], { cwd: DIR, stdio: 'inherit' })
  if (r.status !== 0 || r.error) { hadError = true; console.log(`  ⚠ bot ${id} didn't finish cleanly — continuing; re-run enrich-all.mjs later to retry it.`) }
}
const mins = ((Date.now() - t0) / 60000).toFixed(0)
console.log(`\n${'═'.repeat(48)}`)
console.log(`✓ Done — all ${BOTS.length} bots processed in ~${mins} min.${hadError ? ' (Some had hiccups — a re-run will finish them.)' : ''}`)
console.log(`\n👉 Next, run this one command to make them show up on the dashboards:`)
console.log(`   node rebuild.mjs --fast`)
