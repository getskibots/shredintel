#!/usr/bin/env node
/**
 * build-call-transfers.mjs — GROUND-TRUTH handover ingest from Twilio.
 *
 * For a bot: resolve its Twilio account from report.bot_twilio, pull each call's
 * child call-leg(s) from the Twilio API, and write report.call_transfers — the
 * real transfer signal (did the AI actually <Dial> a human, did they answer, how
 * long). This is what the AI-inferred `handover` field can't know for sure.
 *
 * Account-aware: token comes from env keyed by account_sid — TWILIO_ACCOUNTS json
 * map ({"AC..":"token",..}) for multi-account, or the single TWILIO_ACCOUNT_SID/
 * AUTH_TOKEN today. Resumable (skips already-checked calls) + rate-limited.
 *
 *   node build-call-transfers.mjs [botId=248] [maxCalls]   (maxCalls to sample first)
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
import { decryptToken } from './twilio-token.mjs'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const BOT = Number(process.argv[2] || 248)
const MAX = process.argv[3] ? Number(process.argv[3]) : null
const CONC = 10

function tokenFor(accountSid) {
  const map = (process.env.TWILIO_ACCOUNTS || '').trim()
  if (map) { try { const j = JSON.parse(map); if (j[accountSid]) return j[accountSid] } catch { /* bad json */ } }
  // single-account fallback (today's setup)
  if (!map) return (process.env.TWILIO_AUTH_TOKEN || '').trim() || null
  return null
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='120000ms'")

const cfg = (await c.query('select account_sid, auth_token_enc from report.bot_twilio where bot_id=$1', [BOT])).rows[0]
const acct = cfg?.account_sid
if (!acct) { console.error(`No report.bot_twilio row for bot ${BOT}. Run build-bot-twilio.mjs first.`); process.exit(1) }
// Prefer a dashboard-entered token (encrypted in report.bot_twilio); fall back to env.
const token = decryptToken(cfg?.auth_token_enc) || tokenFor(acct)
if (!token) { console.error(`No Twilio token for account ${acct}. Paste it in the dashboard "Connect Twilio" control (needs TWILIO_TOKEN_ENC_KEY set), or add TWILIO_ACCOUNTS json / TWILIO_AUTH_TOKEN to etl/.env.`); process.exit(1) }
const authHeader = 'Basic ' + Buffer.from(`${acct}:${token}`).toString('base64')

await c.query(`create table if not exists report.call_transfers (
  conversation_id bigint primary key,
  bot_id bigint,
  call_sid text,
  transferred boolean not null default false,
  to_number text,          -- the human destination the AI dialed (sip: or +1…)
  answered boolean,        -- child leg completed = a human picked up
  human_talk_sec int,      -- child leg duration
  child_status text,
  checked_at timestamptz not null default now()
)`)
await c.query('revoke all on report.call_transfers from anon').catch(() => {})
await c.query('create index if not exists call_transfers_bot on report.call_transfers (bot_id)')

const { rows: work } = await c.query(`
  select cb.conversation_id, cb.call_sid
  from report.call_base cb
  where cb.bot_id=$1 and cb.call_sid is not null
    and not exists (select 1 from report.call_transfers t where t.conversation_id = cb.conversation_id)
  order by cb.day desc ${MAX ? 'limit ' + Number(MAX) : ''}`, [BOT])
console.log(`bot ${BOT} · account ${acct.slice(0, 8)}… · ${work.length} calls to check${MAX ? ` (capped ${MAX})` : ''}`)

async function twGet(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/${path}`, { headers: { Authorization: authHeader } })
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); continue }
    if (!r.ok) return { _err: r.status }
    return r.json()
  }
  return { _err: 429 }
}

let idx = 0, done = 0, transferred = 0
const buf = []
async function flush() {
  if (!buf.length) return
  const rows = buf.splice(0, buf.length)
  const vals = [], tup = []
  rows.forEach((r, j) => {
    const b = j * 7
    vals.push(r.conversation_id, BOT, r.call_sid, r.transferred, r.to_number, r.answered, r.human_talk_sec)
    tup.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`)
  })
  await c.query(`insert into report.call_transfers (conversation_id,bot_id,call_sid,transferred,to_number,answered,human_talk_sec)
    values ${tup.join(',')}
    on conflict (conversation_id) do update set transferred=excluded.transferred, to_number=excluded.to_number,
      answered=excluded.answered, human_talk_sec=excluded.human_talk_sec, checked_at=now()`, vals)
}
async function worker() {
  while (idx < work.length) {
    const row = work[idx++]
    try {
      const kids = await twGet(`Calls.json?ParentCallSid=${row.call_sid}&PageSize=20`)
      const legs = (kids.calls || []).filter((k) => k.direction === 'outbound-dial')
      const dialed = legs[0]
      buf.push({
        conversation_id: row.conversation_id, call_sid: row.call_sid,
        transferred: legs.length > 0,
        to_number: dialed ? dialed.to : null,
        answered: dialed ? dialed.status === 'completed' : null,
        human_talk_sec: dialed && dialed.duration ? Number(dialed.duration) : null,
      })
      if (legs.length) transferred++
    } catch { /* skip on error */ }
    done++
    if (buf.length >= 50) await flush()
    if (done % 500 === 0) console.log(`  ${done}/${work.length} · ${transferred} transfers so far`)
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
await flush()
console.log(`✓ done · ${done} checked · ${transferred} had a real transfer`)

// truth-vs-inference snapshot
const cmp = (await c.query(`select
  count(*) filter (where t.transferred)::int real_transfers,
  count(*) filter (where t.transferred and t.answered)::int answered_transfers,
  round(avg(t.human_talk_sec) filter (where t.transferred and t.human_talk_sec>0))::int avg_human_sec,
  count(*) filter (where t.transferred and cb.handover='No Handover')::int missed_by_ai,
  count(*) filter (where not t.transferred and cb.handover in ('Clear Handover','Possible Handover'))::int overflagged_by_ai
  from report.call_transfers t join report.call_base cb using (conversation_id) where t.bot_id=$1`, [BOT])).rows[0]
console.log(`  real transfers: ${cmp.real_transfers} (${cmp.answered_transfers} answered, ~${cmp.avg_human_sec}s w/ human) · AI missed ${cmp.missed_by_ai} · AI over-flagged ${cmp.overflagged_by_ai}`)
await c.end()
