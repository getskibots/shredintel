#!/usr/bin/env node
// refresh-voice-stats.mjs — roll the just-ingested voice raw tables into their
// anon-facing stats matviews. Runs in the nightly AFTER the voice Twilio ingest
// (which runs after the full refresh), because the full refresh happens before
// today's transfers exist — so call_transfer_stats / call_facts_stats need this
// targeted re-roll to carry the newest day. (call_inbound_stats is rebuilt by
// build-call-inbound itself; call_base by refresh.mjs.)
import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: +(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout to '0'")
let bad = 0
for (const mv of ['call_transfer_stats', 'call_facts_stats']) {
  try {
    const t = Date.now()
    await c.query(`refresh materialized view report.${mv}`)
    console.log(`✓ ${mv} (${((Date.now() - t) / 1000).toFixed(0)}s)`)
  } catch (e) {
    bad++
    console.error(`✗ ${mv}: ${e.message}`)
  }
}
await c.end()
process.exit(bad ? 1 : 0)
