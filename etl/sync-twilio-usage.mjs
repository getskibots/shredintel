#!/usr/bin/env node
/**
 * sync-twilio-usage.mjs — the TRUE Twilio bill, via the Usage Records API
 * (Usage/Records/Daily): per account × day × category usage + price. This is
 * the account-truth layer that per-call prices (sync-twilio-costs.mjs) can't
 * see — phone-number rental, recording storage, transcription, carrier fees.
 *
 *   report.twilio_usage_daily  — service-role only (account sids stay private)
 *   report.twilio_bill_daily   — anon-safe fleet rollup: day × cost buckets
 *
 * Same account discovery as the per-call sidecar (active bots' twilio configs
 * in the mirror). Incremental: re-fetches from (max stored day − 3d)/account.
 * Category 'totalprice' is Twilio's own per-day total — used for the bill;
 * the individual categories are kept for the breakdown.
 *
 * Prod write, idempotent.  node sync-twilio-usage.mjs [--full]
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

await c.query(`create table if not exists report.twilio_usage_daily (
  account_sid text not null,
  day         date not null,
  category    text not null,
  usage       numeric,
  usage_unit  text,
  price       numeric,          -- USD for the category on that day
  price_unit  text,
  synced_at   timestamptz not null default now(),
  primary key (account_sid, day, category)
)`)
await c.query('revoke all on report.twilio_usage_daily from anon, authenticated').catch(() => {})

const { rows: accounts } = await c.query(`
  select t.accountsid, max(t.auth_token) auth_token, array_agg(distinct b.id) bot_ids
    from raw.admin_bot b
    join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
   where b.active = 1
     and coalesce(t.accountsid, '') <> '' and coalesce(t.auth_token, '') <> ''
   group by t.accountsid`)
console.log(`${accounts.length} Twilio account(s) with credentials`)

const today = new Date().toISOString().slice(0, 10)
let upserted = 0
for (const acct of accounts) {
  const sid = acct.accountsid.trim()
  const auth = 'Basic ' + Buffer.from(`${sid}:${acct.auth_token.trim()}`).toString('base64')

  const { rows: [w] } = await c.query(
    'select max(day) d from report.twilio_usage_daily where account_sid = $1', [sid])
  const since = FULL || !w.d ? FLOOR : new Date(new Date(w.d).getTime() - 3 * 86400e3).toISOString().slice(0, 10)

  let url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records/Daily.json?PageSize=1000&StartDate=${since}&EndDate=${today}`
  let rows = 0
  let acctUsd = 0
  while (url) {
    const res = await fetchRetry(url, { headers: { Authorization: auth } })
    if (!res.ok) {
      console.log(`  ⚠ ${sid.slice(0, 10)}… HTTP ${res.status} — skipping (${(await res.text()).slice(0, 100)})`)
      break
    }
    const body = await res.json()
    for (const r of body.usage_records || []) {
      const price = r.price != null ? Math.abs(Number(r.price)) : null
      const usage = r.usage != null ? Number(r.usage) : null
      if (!price && !usage) continue // skip all-zero category/days — keeps the table small
      await c.query(
        `insert into report.twilio_usage_daily (account_sid, day, category, usage, usage_unit, price, price_unit, synced_at)
         values ($1,$2,$3,$4,$5,$6,$7,now())
         on conflict (account_sid, day, category) do update set
           usage = excluded.usage, price = excluded.price, synced_at = now()`,
        [sid, r.start_date, r.category, usage, r.usage_unit || null, price, r.price_unit || 'USD'],
      )
      rows++
      upserted++
      if (r.category === 'totalprice') acctUsd += price || 0
    }
    url = body.next_page_uri ? `https://api.twilio.com${body.next_page_uri}` : null
  }
  console.log(`  ${sid.slice(0, 10)}… since ${since}: ${rows} rows · $${acctUsd.toFixed(2)} total (bots ${acct.bot_ids.join(',')})`)
}

// ── anon-safe fleet rollup: one row per day, bucketed costs, no account ids ──
await c.query('drop materialized view if exists report.twilio_bill_daily')
await c.query(`create materialized view report.twilio_bill_daily as
  select day,
         count(distinct account_sid)::int as accounts,
         round(sum(price) filter (where category = 'totalprice'), 4)                          as total_usd,
         round(sum(price) filter (where category = 'calls'), 4)                               as calls_usd,
         round(sum(price) filter (where category = 'phonenumbers'), 4)                        as numbers_usd,
         round(sum(price) filter (where category in ('recordings','recordingstorage')), 4)    as recordings_usd,
         round(sum(price) filter (where category = 'calls-media-stream-minutes'), 4)          as media_streams_usd,
         round(sum(price) filter (where category = 'transcriptions'), 4)                      as transcriptions_usd,
         round(sum(price) filter (where category like 'sms%'), 4)                             as sms_usd
    from report.twilio_usage_daily
   group by day`)
await c.query('create unique index twilio_bill_daily_pk on report.twilio_bill_daily (day)')
await c.query('grant select on report.twilio_bill_daily to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const { rows: [t] } = await c.query(`
  select min(day) mn, max(day) mx,
         round(sum(total_usd), 2)   total,
         round(sum(calls_usd), 2)   calls,
         round(sum(numbers_usd), 2) numbers,
         round(sum(recordings_usd), 2) recordings
    from report.twilio_bill_daily`)
console.log(`\n✓ ${upserted} usage rows · bill ${t.mn}→${t.mx}: $${t.total} total = calls $${t.calls} + numbers $${t.numbers} + recordings $${t.recordings} + other`)
const { rows: [m] } = await c.query(`
  select round(sum(total_usd), 2) usd from report.twilio_bill_daily where day >= current_date - 30`)
console.log(`  last 30 days: $${m.usd}`)
await c.end()
