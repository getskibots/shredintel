#!/usr/bin/env node
/**
 * build-call-facts.mjs — GROUND-TRUTH call facts from Twilio (the PARENT call).
 *
 * The mirror's duration (closed_at − started_at) is unreliable (recon 2026-07-08:
 * 0/40 matched Twilio). This pulls each call's REAL status + duration + start/end +
 * cost from the Twilio API, keyed by call_sid (the unifying field: Twilio Call SID ≡
 * Botscrew admin_call.call_sid). Combined with report.call_transfers (the child human
 * leg), it yields TRUE AI-handled time = parent duration − human leg.
 *
 * Account-aware (token from env keyed by account_sid — TWILIO_ACCOUNTS json map, or
 * single TWILIO_AUTH_TOKEN today). Resumable (skips already-fetched) + rate-limited.
 * Server-only table (revoke anon); the anon rollup is build-call-facts-stats.mjs.
 *
 *   node build-call-facts.mjs [botId=248] [maxCalls]   (maxCalls to sample first)
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
  if (!map) return (process.env.TWILIO_AUTH_TOKEN || '').trim() || null
  return null
}
const iso = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d.toISOString() }

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='120000ms'")

const cfg = (await c.query('select account_sid, auth_token_enc from report.bot_twilio where bot_id=$1', [BOT])).rows[0]
const _cred = (await c.query(`select t.accountsid, t.auth_token from raw.admin_bot b join raw.admin_twilio_configs t on t.id=b.twilio_configs_id where b.id=$1 and coalesce(t.accountsid,'')<>'' and coalesce(t.auth_token,'')<>'' limit 1`, [BOT])).rows[0]
const acct = _cred?.accountsid?.trim() || cfg?.account_sid
if (!acct) { console.error(`No report.bot_twilio row for bot ${BOT}. Run build-bot-twilio.mjs / the Connect Twilio console first.`); process.exit(1) }
// Prefer a dashboard-entered token (encrypted in report.bot_twilio); fall back to env.
const token = _cred?.auth_token?.trim() || decryptToken(cfg?.auth_token_enc) || tokenFor(acct)
if (!token) { console.error(`No Twilio token for account ${acct}. Paste it in the dashboard "Connect Twilio" control (needs TWILIO_TOKEN_ENC_KEY set), or add TWILIO_ACCOUNTS json / TWILIO_AUTH_TOKEN to etl/.env.`); process.exit(1) }
const authHeader = 'Basic ' + Buffer.from(`${acct}:${token}`).toString('base64')

await c.query(`create table if not exists report.call_facts (
  conversation_id bigint primary key,
  bot_id bigint,
  call_sid text,
  status text,             -- Twilio call status (completed / no-answer / busy / failed / canceled)
  duration_sec int,        -- Twilio REAL call duration (truth)
  direction text,
  started_at timestamptz,  -- Twilio start_time
  ended_at timestamptz,    -- Twilio end_time
  to_number text,          -- the bot's inbound number (parent call "to")
  price numeric,           -- call cost (USD, negative in Twilio; stored as-is)
  checked_at timestamptz not null default now()
)`)
await c.query('revoke all on report.call_facts from anon').catch(() => {})
await c.query('create index if not exists call_facts_bot on report.call_facts (bot_id)')

const { rows: work } = await c.query(`
  select cb.conversation_id, cb.call_sid
  from report.call_base cb
  where cb.bot_id=$1 and cb.call_sid is not null
    and not exists (select 1 from report.call_facts f where f.conversation_id = cb.conversation_id)
  order by cb.day desc ${MAX ? 'limit ' + Number(MAX) : ''}`, [BOT])
console.log(`bot ${BOT} · account ${acct.slice(0, 8)}… · ${work.length} calls to fetch${MAX ? ` (capped ${MAX})` : ''}`)

async function twGet(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acct}/${path}`, { headers: { Authorization: authHeader } })
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); continue }
    if (!r.ok) return { _err: r.status }
    return r.json()
  }
  return { _err: 429 }
}

let idx = 0, done = 0, errs = 0
const buf = []
async function flush() {
  if (!buf.length) return
  const rows = buf.splice(0, buf.length)
  const tuples = rows.map((_, j) => {
    const b = j * 10
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`
  })
  const flat = []
  rows.forEach((r) => flat.push(r.conversation_id, BOT, r.call_sid, r.status, r.duration_sec, r.direction, r.started_at, r.ended_at, r.to_number, r.price))
  await c.query(`insert into report.call_facts
    (conversation_id,bot_id,call_sid,status,duration_sec,direction,started_at,ended_at,to_number,price)
    values ${tuples.join(',')}
    on conflict (conversation_id) do update set
      status=excluded.status, duration_sec=excluded.duration_sec, direction=excluded.direction,
      started_at=excluded.started_at, ended_at=excluded.ended_at, to_number=excluded.to_number,
      price=excluded.price, checked_at=now()`, flat)
}
async function worker() {
  while (idx < work.length) {
    const row = work[idx++]
    const t = await twGet(`Calls/${row.call_sid}.json`)
    if (t._err) { errs++; done++; continue }
    buf.push({
      conversation_id: row.conversation_id, call_sid: row.call_sid,
      status: t.status ?? null,
      duration_sec: t.duration != null ? Number(t.duration) : null,
      direction: t.direction ?? null,
      started_at: iso(t.start_time), ended_at: iso(t.end_time),
      to_number: t.to ?? null,
      price: t.price != null ? Number(t.price) : null,
    })
    done++
    if (buf.length >= 50) await flush()
    if (done % 1000 === 0) console.log(`  ${done}/${work.length} · ${errs} errors`)
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
await flush()
console.log(`✓ done · ${done} fetched · ${errs} errors`)

const v = (await c.query(`select
  count(*)::int rows,
  count(*) filter (where status='completed')::int completed,
  percentile_cont(0.5) within group (order by duration_sec) filter (where duration_sec between 1 and 7200)::int median_dur,
  round(avg(duration_sec) filter (where duration_sec between 1 and 7200))::int avg_dur,
  round(sum(duration_sec) filter (where duration_sec between 1 and 7200)/3600.0,1) talk_hrs
  from report.call_facts where bot_id=$1`, [BOT])).rows[0]
console.log(`bot ${BOT}: ${v.rows} facts · ${v.completed} completed · median ${v.median_dur}s · avg ${v.avg_dur}s · ${v.talk_hrs}h total (Twilio truth)`)
await c.end()
