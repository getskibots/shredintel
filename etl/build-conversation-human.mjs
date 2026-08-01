#!/usr/bin/env node
/**
 * build-conversation-human.mjs — report.conversation_human: the GROUND-TRUTH
 * "a real human actually engaged" flag, one row per conversation that got one.
 *
 * Two truth sources (NOT the AI-inferred `handover` field):
 *   • chat  — raw.admin_chat_history.is_from_support = 1 (a support agent typed a reply)
 *   • voice — report.call_transfers.transferred (the AI actually <Dial>ed a person)
 *
 * This is what powers the "Got a human" slice of Master'Botter's "Who solved it"
 * card and the outcome drill. Kept as its own small matview (~31k rows) so the
 * fleet_fix / fleet_drill RPCs can join it in a lookup instead of re-scanning the
 * 5.8M-row chat history live. Refreshed nightly (add to the MATVIEWS list).
 *
 * ⚠️ Voice coverage is only as complete as report.call_transfers, which is built
 * per-bot from the Twilio API (build-call-transfers.mjs) — today just the top voice
 * bots. Uncovered voice bots' transfers won't register here yet. Chat is complete.
 *
 * Prod write, idempotent.  node build-conversation-human.mjs
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='180000ms'")

// drop first so a definition change can't silently keep an old shape
await c.query('drop materialized view if exists report.conversation_human')
await c.query(`
create materialized view report.conversation_human as
  select conversation_id, true as got_human
    from (
      select distinct conversation_id from raw.admin_chat_history where is_from_support = 1
      union
      select conversation_id from report.call_transfers where transferred
    ) u
    where conversation_id is not null`)
await c.query('create unique index conversation_human_pk on report.conversation_human (conversation_id)')
await c.query('grant select on report.conversation_human to anon, authenticated')

const { rows: [r] } = await c.query(`
  select
    (select count(*) from report.conversation_human) as total_human,
    (select count(*) from report.conversation_human h
       join report.conversation_intel ci using (conversation_id) where ci.substantive) as substantive_human`)
console.log(`✓ report.conversation_human built · ${r.total_human} conversations got a human (${r.substantive_human} substantive)`)
await c.end()
