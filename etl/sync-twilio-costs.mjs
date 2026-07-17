#!/usr/bin/env node
/**
 * sync-twilio-costs.mjs — pull per-call price/duration from the Twilio API into
 * report.twilio_call_cost, and roll it up to the anon-safe report.voice_cost_daily
 * matview (bot_id × day × calls/minutes/cost). Phase-2 of the fleet dashboard:
 * real voice $ per bot.
 *
 * Accounts are discovered from the mirror itself — raw.admin_bot.twilio_configs_id
 * → raw.admin_twilio_configs (accountsid + auth_token), active bots only — so new
 * voice bots are covered with no manual mapping. GSB owns the Twilio account(s).
 *
 * Attribution per call, in order:
 *   1. call_sid → raw.admin_call → conversation → user → bot_id  (exact)
 *   2. child legs (transfer/handover dials) inherit the PARENT call's bot —
 *      outbound-dial legs are how escalations get billed          (parent_call_sid)
 *   3. the call's bot-side number (to for inbound / from for outbound) matched
 *      against the account's bots' twilio numbers                 (shared account)
 *   4. account_sid maps to exactly ONE active bot                 (dedicated account)
 *
 * PRIVACY: the caller's number is NEVER stored — only the bot-side number.
 * report.twilio_call_cost is service-role only; anon sees just the daily rollup.
 *
 * Incremental: re-fetches from (max stored day − 3d) per account — Twilio prices
 * can post late. First run backfills from 2024-10-01 (the report floor).
 * NOTE: per-call price only — number rental (~$1.15/mo) + recording storage are
 * not included, so this slightly undercounts the bill.
 *
 * Prod write, idempotent.  node sync-twilio-costs.mjs [--full]
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import { fetchRetry, resilientClient } from './_twilio-lib.mjs'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const FULL = process.argv.includes('--full')
const FLOOR = '2024-10-01'

const c = resilientClient(process.env)
await c.connect()

// ── destination table (service-role only) ────────────────────────────────────
await c.query(`create table if not exists report.twilio_call_cost (
  call_sid     text primary key,
  account_sid  text not null,
  bot_id       bigint,             -- null = unattributed (visible in the audit log)
  day          date not null,      -- call start, UTC — matches the report day basis
  parent_call_sid text,            -- set on child legs (transfer dials) — bot inherited from parent
  direction    text,
  bot_number   text,               -- the bot-side line; caller number is never stored
  duration_sec int,
  price        numeric,            -- absolute USD (Twilio reports charges negative)
  price_unit   text,
  synced_at    timestamptz not null default now()
)`)
await c.query('alter table report.twilio_call_cost add column if not exists parent_call_sid text')
await c.query('create index if not exists twilio_call_cost_bot_day on report.twilio_call_cost (bot_id, day)')
await c.query('revoke all on report.twilio_call_cost from anon, authenticated').catch(() => {})

// ── accounts to sync: active bots' twilio configs with credentials ───────────
const { rows: accounts } = await c.query(`
  select t.accountsid, max(t.auth_token) auth_token,
         array_agg(distinct b.id) bot_ids,
         array_agg(distinct nullif(regexp_replace(coalesce(t.phone, ''), '[^+0-9]', '', 'g'), '')) numbers
    from raw.admin_bot b
    join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
   where b.active = 1
     and coalesce(t.accountsid, '') <> '' and coalesce(t.auth_token, '') <> ''
   group by t.accountsid`)
console.log(`${accounts.length} Twilio account(s) with credentials across active bots`)

// bot phone book for shared-account attribution (normalized, digits+plus)
const { rows: phoneRows } = await c.query(`
  select b.id bot_id, regexp_replace(t.phone, '[^+0-9]', '', 'g') phone
    from raw.admin_bot b
    join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
   where b.active = 1 and coalesce(t.phone, '') <> ''`)
const byPhone = new Map(phoneRows.map((r) => [r.phone, Number(r.bot_id)]))

const norm = (s) => (s || '').replace(/[^+0-9]/g, '')

let fetched = 0
let upserted = 0
for (const acct of accounts) {
  const sid = acct.accountsid.trim()
  const auth = 'Basic ' + Buffer.from(`${sid}:${acct.auth_token.trim()}`).toString('base64')
  const soloBot = acct.bot_ids.length === 1 ? Number(acct.bot_ids[0]) : null

  // watermark: refetch a 3-day tail so late-posting prices get updated
  const { rows: [w] } = await c.query(
    'select max(day) d from report.twilio_call_cost where account_sid = $1', [sid])
  const since = FULL || !w.d ? FLOOR : new Date(new Date(w.d).getTime() - 3 * 86400e3).toISOString().slice(0, 10)

  let url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=1000&StartTime%3E=${since}`
  let acctCalls = 0
  while (url) {
    const res = await fetchRetry(url, { headers: { Authorization: auth } })
    if (!res.ok) {
      console.log(`  ⚠ ${sid.slice(0, 10)}… HTTP ${res.status} — skipping account (${(await res.text()).slice(0, 120)})`)
      break
    }
    const body = await res.json()
    const calls = body.calls || []
    fetched += calls.length
    acctCalls += calls.length
    for (const call of calls) {
      if (!call.start_time) continue
      const day = new Date(call.start_time).toISOString().slice(0, 10)
      const inbound = (call.direction || '').startsWith('inbound')
      const botNumber = norm(inbound ? call.to : call.from)
      const botId = byPhone.get(botNumber) ?? soloBot // pass 3 + 4; passes 1 + 2 are SQL below
      await c.query(
        `insert into report.twilio_call_cost
           (call_sid, account_sid, bot_id, day, parent_call_sid, direction, bot_number, duration_sec, price, price_unit, synced_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (call_sid) do update set
           duration_sec = excluded.duration_sec, price = excluded.price,
           parent_call_sid = excluded.parent_call_sid,
           bot_id = coalesce(report.twilio_call_cost.bot_id, excluded.bot_id), synced_at = now()`,
        [call.sid, sid, botId, day, call.parent_call_sid || null, call.direction, botNumber || null,
         call.duration != null ? Number(call.duration) : null,
         call.price != null ? Math.abs(Number(call.price)) : null,
         call.price_unit || 'USD'],
      )
      upserted++
    }
    url = body.next_page_uri ? `https://api.twilio.com${body.next_page_uri}` : null
  }
  console.log(`  ${sid.slice(0, 10)}… since ${since}: ${acctCalls} calls (bots ${acct.bot_ids.join(',')})`)
}

// pass 1 — exact attribution via admin_call → conversation → user → bot
const fixed = await c.query(`
  update report.twilio_call_cost tc
     set bot_id = u.bot_id
    from raw.admin_call ac
    join raw.admin_conversation cv on cv.id = ac.conversation_id
    join raw.admin_user u on u.id = cv.user_id
   where ac.call_sid = tc.call_sid
     and u.bot_id is not null and u.bot_id is distinct from tc.bot_id`)
console.log(`attribution: ${fixed.rowCount} rows corrected via admin_call join`)

// pass 2 — child legs (transfer dials) inherit the parent call's bot. Iterate to
// cover chains (dial → dial); 3 rounds is plenty in practice.
for (let round = 1; round <= 3; round++) {
  const inh = await c.query(`
    update report.twilio_call_cost child
       set bot_id = parent.bot_id
      from report.twilio_call_cost parent
     where child.parent_call_sid = parent.call_sid
       and child.bot_id is null and parent.bot_id is not null`)
  console.log(`attribution: round ${round} — ${inh.rowCount} child legs inherited from parent`)
  if (inh.rowCount === 0) break
}

// NOTE: the anon per-bot rollup report.voice_cost_daily is built by
// build-voice-cost.mjs (usage from here + line rental from sync-twilio-usage.mjs).
// Run that AFTER this + the usage sync. This script owns only twilio_call_cost.
await c.query(`notify pgrst, 'reload schema'`)

const { rows: [t] } = await c.query(`
  select count(*)::int calls, count(*) filter (where bot_id is null)::int unattributed,
         round(sum(coalesce(price,0)), 2) total_usd,
         min(day) mn, max(day) mx
    from report.twilio_call_cost`)
console.log(`\n✓ ${fetched} fetched · ${upserted} upserted · table: ${t.calls} calls ${t.mn}→${t.mx} · $${t.total_usd} total · ${t.unattributed} unattributed`)
const { rows: top } = await c.query(`
  select bot_id, sum(calls) calls, sum(minutes) minutes, round(sum(cost_usd),2) usd
    from report.voice_cost_daily where day >= current_date - 30 group by bot_id order by usd desc limit 6`)
for (const r of top) console.log(`  bot ${r.bot_id}: ${r.calls} calls / ${r.minutes} min / $${r.usd} (30d)`)
await c.end()
