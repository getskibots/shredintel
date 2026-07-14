#!/usr/bin/env node
/**
 * build-call-inbound.mjs — TRUE call VOLUME + CONNECTION from Twilio.
 *
 * The mirror's "voice_convs" double-counts (Botscrew logs ~1.6 conversation records
 * per real call — the escalation/second leg — so 248 shows 23,461 "calls" for 14,517
 * real ones, and a phantom "41% didn't connect"). This lists EVERY inbound call to
 * the bot's number(s) from Twilio and rolls up the real volume + connection status.
 *
 * Twilio truth (recon 2026-07-08, bot 248): 14,517 inbound · 99.3% completed · 0.7%
 * no-answer/busy. Source for the "Voice calls / Connected / Didn't connect" tiles.
 *
 * Account-aware (token from env keyed by account_sid). Full refresh via upsert on
 * call_sid (idempotent). Server-only call_inbound; anon rollup = call_inbound_stats
 * (per bot / resort-local day, aligned to call_base via report.bot_timezone).
 *   node build-call-inbound.mjs [botId=248]
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const BOT = Number(process.argv[2] || 248)
const FLOOR = '2024-10-01'

function tokenFor(accountSid) {
  const map = (process.env.TWILIO_ACCOUNTS || '').trim()
  if (map) {
    try { const j = JSON.parse(map); if (j[accountSid]) return j[accountSid] } catch { /* bad json */ }
    // The single TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN pair counts as one implicit
    // entry, so adding TWILIO_ACCOUNTS for a NEW account (e.g. Sipapu) doesn't require
    // re-listing the default account's token.
    const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim()
    if (sid && sid === accountSid) return (process.env.TWILIO_AUTH_TOKEN || '').trim() || null
    return null
  }
  return (process.env.TWILIO_AUTH_TOKEN || '').trim() || null
}
const iso = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString() }

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='300000ms'")

const acct = (await c.query('select account_sid from report.bot_twilio where bot_id=$1', [BOT])).rows[0]?.account_sid
if (!acct) { console.error(`No report.bot_twilio row for bot ${BOT}. Connect it in the dashboard first.`); process.exit(1) }
const token = tokenFor(acct)
if (!token) { console.error(`No Twilio token for account ${acct}. Add TWILIO_ACCOUNTS json (or TWILIO_AUTH_TOKEN) to etl/.env.`); process.exit(1) }
const authHeader = 'Basic ' + Buffer.from(`${acct}:${token}`).toString('base64')

// The bot's inbound number(s): its configured number + any number its calls came to.
const numbers = (await c.query(`
  select distinct num from (
    select phone_number num from report.bot_twilio where bot_id=$1 and phone_number is not null
    union select to_number from report.call_facts where bot_id=$1 and to_number is not null
  ) s where num is not null and num <> ''`, [BOT])).rows.map((r) => r.num)
if (!numbers.length) { console.error(`No known inbound number for bot ${BOT} (run build-call-facts.mjs first, or set phone_number).`); process.exit(1) }
console.log(`bot ${BOT} · account ${acct.slice(0, 8)}… · numbers: ${numbers.join(', ')}`)

await c.query(`create table if not exists report.call_inbound (
  call_sid text primary key, bot_id bigint, to_number text, status text,
  duration_sec int, started_at timestamptz, fetched_at timestamptz not null default now())`)
await c.query('revoke all on report.call_inbound from anon').catch(() => {})
await c.query('create index if not exists call_inbound_bot on report.call_inbound (bot_id)')

async function twGet(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Authorization: authHeader } })
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); continue }
    if (!r.ok) return { _err: r.status }
    return r.json()
  }
  return { _err: 429 }
}
async function upsert(rows) {
  if (!rows.length) return
  const tuples = rows.map((_, j) => { const b = j * 6; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})` })
  const flat = []
  rows.forEach((r) => flat.push(r.call_sid, BOT, r.to_number, r.status, r.duration_sec, r.started_at))
  await c.query(`insert into report.call_inbound (call_sid,bot_id,to_number,status,duration_sec,started_at)
    values ${tuples.join(',')}
    on conflict (call_sid) do update set to_number=excluded.to_number, status=excluded.status,
      duration_sec=excluded.duration_sec, started_at=excluded.started_at, fetched_at=now()`, flat)
}

let total = 0, pages = 0
let buf = []
for (const num of numbers) {
  let url = `https://api.twilio.com/2010-04-01/Accounts/${acct}/Calls.json?To=${encodeURIComponent(num)}&StartTime%3E=${FLOOR}&PageSize=1000`
  while (url && pages < 200) {
    const j = await twGet(url); pages++
    if (j._err) { console.log(`  page error ${j._err}`); break }
    for (const call of (j.calls || [])) {
      if (call.direction !== 'inbound') continue
      buf.push({ call_sid: call.sid, to_number: call.to, status: call.status, duration_sec: call.duration != null ? Number(call.duration) : null, started_at: iso(call.start_time) })
      total++
    }
    if (buf.length >= 500) { await upsert(buf); buf = [] }
    url = j.next_page_uri ? `https://api.twilio.com${j.next_page_uri}` : null
  }
}
await upsert(buf)
console.log(`✓ ${total} inbound calls ingested (${pages} pages)`)

// ── anon rollup: per bot / resort-local day (aligned to call_base) ──
await c.query('drop materialized view if exists report.call_inbound_stats cascade')
await c.query(`create materialized view report.call_inbound_stats as
  select ci.bot_id,
    (ci.started_at at time zone coalesce(tz.tz, 'America/Denver'))::date as day,
    count(*)::int inbound,
    count(*) filter (where ci.status = 'completed')::int completed,
    count(*) filter (where ci.status <> 'completed')::int not_connected
  from report.call_inbound ci
  left join report.bot_timezone tz on tz.bot_id = ci.bot_id
  where ci.started_at is not null
  group by ci.bot_id, 2`)
await c.query('create unique index call_inbound_stats_pk on report.call_inbound_stats (bot_id, day)')
await c.query('grant select on report.call_inbound_stats to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.call_inbound_stats built + granted')

const v = (await c.query(`select sum(inbound)::int inbound, sum(completed)::int completed, sum(not_connected)::int not_connected
  from report.call_inbound_stats where bot_id=$1`, [BOT])).rows[0]
console.log(`bot ${BOT}: ${v.inbound} real calls · ${v.completed} connected (${Math.round(100*v.completed/Math.max(v.inbound,1))}%) · ${v.not_connected} didn't connect`)
await c.end()
