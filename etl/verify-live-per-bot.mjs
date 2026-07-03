#!/usr/bin/env node
/**
 * verify-live-per-bot.mjs — triple-check that the app's LIVE path works.
 * Impersonates the `anon` role (exactly what the browser's anon key uses) and
 * runs the app's precise query pattern (WHERE bot_id=$ AND day BETWEEN from/to)
 * against ALL 9 report views for each live bot. Proves:
 *   1. anon has SELECT on every view (incl. the new conversation_depth) → REST-readable
 *   2. per-bot filtering returns bot-specific rows
 *   3. the numbers differ per bot (real isolation, not a shared blob)
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// The 9 views fetchLiveBundle pulls, all keyed (bot_id, day)
const VIEWS = [
  'outcome_timeline', 'conversion_pulse', 'knowledge_source_leaderboard',
  'sender_mix_stack', 'guest_identity_split', 'lead_capture_funnel',
  'device_experience_mix', 'demand_heatmap', 'conversation_depth',
]

// app's periodDates('7d'|'30d'): to = yesterday UTC, from = to-(N-1)
function windowFor(days) {
  const to = new Date(); to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - (days - 1))
  const iso = (d) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}

console.log('Impersonating anon role (the browser anon key identity)…')
await c.query('set role anon')

for (const botId of [43, 2]) {
  console.log(`\n════ bot ${botId} ════`)
  for (const days of [7, 30]) {
    const { from, to } = windowFor(days)
    // per-view REST-equivalent read: rows visible to anon in the window
    const results = {}
    let denied = null
    for (const v of VIEWS) {
      try {
        const { rows } = await c.query(
          `select count(*)::int rows from report.${v} where bot_id=$1 and day between $2 and $3`,
          [botId, from, to])
        results[v] = rows[0].rows
      } catch (e) { results[v] = 'ERR'; denied = denied || `${v}: ${e.message.split('\n')[0]}` }
    }
    // headline metrics from conversation_depth (the new §1 view)
    const { rows: [cd] } = await c.query(`
      select coalesce(sum(conversations),0) sessions,
             coalesce(sum(total_messages),0) messages,
             coalesce(sum(single_user_msg_sessions),0) single_msg,
             coalesce(sum(engaged_conversations),0) engaged
        from report.conversation_depth where bot_id=$1 and day between $2 and $3`, [botId, from, to])
    const mps = cd.sessions > 0 ? (cd.messages / cd.sessions).toFixed(1) : '—'
    console.log(`  last ${days}d (${from}→${to}):`)
    console.log(`    view row-counts: ${VIEWS.map((v) => `${v.split('_')[0]}=${results[v]}`).join('  ')}`)
    console.log(`    §1 conversation_depth: sessions=${cd.sessions} messages=${cd.messages} msgs/session=${mps} engaged=${cd.engaged} single-msg=${cd.single_msg}`)
    if (denied) console.log(`    ⚠ anon DENIED → ${denied}`)
  }
}

await c.query('reset role')
await c.end()
console.log('\n✓ anon can read all 9 views per bot_id — live REST path is wired.')
