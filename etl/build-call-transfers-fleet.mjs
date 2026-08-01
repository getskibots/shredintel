#!/usr/bin/env node
/**
 * build-call-transfers-fleet.mjs — FLEET-WIDE ground-truth transfer ingest.
 *
 * Does automatically, for EVERY voice bot, what build-call-transfers.mjs did for
 * one: discovers each bot's Twilio account + auth token straight from the Botscrew
 * mirror (raw.admin_bot.twilio_configs_id → raw.admin_twilio_configs — the SAME
 * source the cost sync uses, so no hand-entered tokens, no per-bot sheet), then
 * pulls each call's child legs from the Twilio API and writes report.call_transfers
 * (transferred / answered / human_talk_sec). This is the ground truth behind the
 * "Got a human" outcome (report.conversation_human reads call_transfers.transferred).
 *
 * Resumable (skips calls already checked) + rate-limited. Groups work by account so
 * one auth header serves all its bots. Reports any account whose token 401s — those
 * are the ONLY ones that need a fresh token (rotate in Botscrew, or hand me a sheet
 * of just those account SIDs).
 *
 *   node build-call-transfers-fleet.mjs [--full]   (--full re-checks every call)
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const FULL = process.argv.includes('--full')
const CONC = 10

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='0'")

await c.query(`create table if not exists report.call_transfers (
  conversation_id bigint primary key,
  bot_id bigint,
  call_sid text,
  transferred boolean not null default false,
  to_number text,
  answered boolean,
  human_talk_sec int,
  child_status text,
  checked_at timestamptz not null default now()
)`)
await c.query('revoke all on report.call_transfers from anon').catch(() => {})
await c.query('create index if not exists call_transfers_bot on report.call_transfers (bot_id)')

// Every voice account behind a bot that has calls, with its token, from the mirror.
const { rows: accounts } = await c.query(`
  select t.accountsid, max(t.auth_token) auth_token, array_agg(distinct b.id) bot_ids
    from raw.admin_bot b
    join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
   where b.id in (select distinct bot_id from report.call_base)
     and coalesce(t.accountsid,'') <> '' and coalesce(t.auth_token,'') <> ''
   group by t.accountsid`)
console.log(`${accounts.length} Twilio accounts behind voice bots\n`)

async function twGet(acct, authHeader, path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/${path}`, { headers: { Authorization: authHeader } })
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); continue }
      if (r.status === 401) return { _err: 401 }
      if (!r.ok) return { _err: r.status }
      return r.json()
    } catch { await new Promise((res) => setTimeout(res, 500 * (i + 1))) }
  }
  return { _err: 'retry' }
}

const bad = [], summary = []
let grandChecked = 0, grandTransfers = 0

for (const a of accounts) {
  const acct = a.accountsid.trim()
  const authHeader = 'Basic ' + Buffer.from(`${acct}:${a.auth_token.trim()}`).toString('base64')
  const { rows: work } = await c.query(`
    select cb.conversation_id, cb.call_sid, cb.bot_id
      from report.call_base cb
     where cb.bot_id = any($1) and cb.call_sid is not null
       ${FULL ? '' : 'and not exists (select 1 from report.call_transfers t where t.conversation_id = cb.conversation_id)'}
     order by cb.day desc`, [a.bot_ids])
  if (!work.length) { summary.push(`${acct.slice(0, 10)}… ${a.bot_ids.length} bot(s): nothing new`); continue }

  // probe the token once so a 401 account is reported cleanly, not 500 failed fetches
  const probe = await twGet(acct, authHeader, `Calls.json?PageSize=1`)
  if (probe._err === 401) { bad.push(acct); summary.push(`${acct.slice(0, 10)}… ${a.bot_ids.length} bot(s): 🔒 401 (stale token) — ${work.length} calls skipped`); continue }

  let idx = 0, checked = 0, transfers = 0
  const buf = []
  async function flush() {
    if (!buf.length) return
    const rows = buf.splice(0, buf.length), vals = [], tup = []
    rows.forEach((r, j) => {
      const b = j * 8
      vals.push(r.conversation_id, r.bot_id, r.call_sid, r.transferred, r.to_number, r.answered, r.human_talk_sec, r.child_status)
      tup.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`)
    })
    await c.query(`insert into report.call_transfers (conversation_id,bot_id,call_sid,transferred,to_number,answered,human_talk_sec,child_status)
      values ${tup.join(',')}
      on conflict (conversation_id) do update set transferred=excluded.transferred, to_number=excluded.to_number,
        answered=excluded.answered, human_talk_sec=excluded.human_talk_sec, child_status=excluded.child_status, checked_at=now()`, vals)
  }
  async function worker() {
    while (idx < work.length) {
      const row = work[idx++]
      const kids = await twGet(acct, authHeader, `Calls.json?ParentCallSid=${row.call_sid}&PageSize=20`)
      if (!kids._err) {
        const legs = (kids.calls || []).filter((k) => k.direction === 'outbound-dial')
        const dialed = legs[0]
        buf.push({
          conversation_id: row.conversation_id, bot_id: row.bot_id, call_sid: row.call_sid,
          transferred: legs.length > 0,
          to_number: dialed ? dialed.to : null,
          answered: dialed ? dialed.status === 'completed' : null,
          human_talk_sec: dialed && dialed.duration ? Number(dialed.duration) : null,
          child_status: dialed ? dialed.status : null,
        })
        if (legs.length) transfers++
      }
      checked++
      if (buf.length >= 50) await flush()
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  await flush()
  grandChecked += checked; grandTransfers += transfers
  summary.push(`${acct.slice(0, 10)}… ${a.bot_ids.length} bot(s): ${checked} checked · ${transfers} transfers`)
  console.log(`  ✓ ${acct.slice(0, 10)}… ${checked} checked · ${transfers} transfers`)
}

console.log(`\n===== SUMMARY =====`)
for (const s of summary) console.log('  ' + s)
console.log(`\n${grandChecked} calls checked · ${grandTransfers} real transfers`)
if (bad.length) {
  console.log(`\n🔒 ${bad.length} account(s) returned 401 (token rotated in Twilio but stale in the mirror):`)
  for (const b of bad) console.log('  ' + b)
  console.log('  → paste a fresh auth token for ONLY these account SIDs (that is the only manual bit).')
} else {
  console.log('\n✅ every account authenticated — no sheet needed.')
}
await c.end()
