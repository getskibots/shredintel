#!/usr/bin/env node
/**
 * build-voice-cost.mjs — report.voice_cost_daily, the anon per-bot voice-cost
 * rollup the fleet dashboard reads. Combines BOTH Twilio lanes:
 *
 *   usage  = per-call price          (report.twilio_call_cost, has bot_id)
 *   rental = monthly number rental   (report.twilio_usage_daily 'phonenumbers')
 *
 * Number rental is billed PER ACCOUNT (a lump on each number's renewal day), not
 * per call — so there's no call_sid to attribute it. We allocate each account's
 * daily phonenumbers charge EVENLY across the bots that actually RECEIVE CALLS on
 * that account (its voice bots, derived from twilio_call_cost) — the same bots
 * usage is attributed to. Chat bots never take calls, so they get $0 rental
 * (correct — only the phone lines cost rent).
 *
 * cost_usd = usage_usd + rental_usd. This REPLACES the simpler usage-only rollup
 * that sync-twilio-costs.mjs used to build; run this AFTER both Twilio syncs.
 *
 * Depends on: report.twilio_call_cost + report.twilio_usage_daily.
 * Prod write, idempotent.  node build-voice-cost.mjs
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

await c.query('drop materialized view if exists report.voice_cost_daily cascade')
await c.query(`create materialized view report.voice_cost_daily as
  with acct_bots as (   -- bots that actually receive calls on each account = its voice bots
    select distinct account_sid, bot_id
      from report.twilio_call_cost
     where bot_id is not null and coalesce(account_sid, '') <> ''
  ),
  acct_n as (select account_sid, count(*) n from acct_bots group by 1),
  rental as (   -- split each account's daily phonenumbers charge across its bots
    select ab.bot_id, u.day, sum(u.price / an.n) as rental_usd
      from report.twilio_usage_daily u
      join acct_bots ab on ab.account_sid = u.account_sid
      join acct_n   an on an.account_sid = u.account_sid
     where u.category = 'phonenumbers' and coalesce(u.price, 0) > 0
     group by ab.bot_id, u.day
  ),
  usage as (    -- per-call price, already attributed to a bot
    select bot_id, day,
           count(*)::int                            as calls,
           sum(coalesce(duration_sec, 0)) / 60.0    as minutes,
           sum(coalesce(price, 0))                  as usage_usd
      from report.twilio_call_cost
     where bot_id is not null
     group by bot_id, day
  )
  select coalesce(u.bot_id, r.bot_id)               as bot_id,
         coalesce(u.day, r.day)                     as day,
         coalesce(u.calls, 0)                       as calls,
         round(coalesce(u.minutes, 0), 1)           as minutes,
         round(coalesce(u.usage_usd, 0), 4)         as usage_usd,
         round(coalesce(r.rental_usd, 0), 4)        as rental_usd,
         round(coalesce(u.usage_usd, 0) + coalesce(r.rental_usd, 0), 4) as cost_usd
    from usage u
    full outer join rental r on r.bot_id = u.bot_id and r.day = u.day`)
await c.query('create unique index voice_cost_daily_pk on report.voice_cost_daily (bot_id, day)')
await c.query('grant select on report.voice_cost_daily to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const { rows: [t] } = await c.query(`
  select round(sum(usage_usd),2) usage, round(sum(rental_usd),2) rental, round(sum(cost_usd),2) total
    from report.voice_cost_daily where day >= current_date - 30`)
console.log(`✓ report.voice_cost_daily rebuilt (usage + rental) · 30d fleet: usage $${t.usage} + rental $${t.rental} = $${t.total}`)
const { rows: top } = await c.query(`
  select v.bot_id, coalesce(b.name,'?') name,
         round(sum(v.usage_usd),2) usage, round(sum(v.rental_usd),2) rental, round(sum(v.cost_usd),2) total
    from report.voice_cost_daily v left join public.bots b on b.id = v.bot_id
   where v.day >= current_date - 30 group by 1,2 order by total desc limit 6`)
for (const r of top) console.log(`  bot ${String(r.bot_id).padStart(4)}  usage $${r.usage} + rental $${r.rental} = $${r.total}  ${r.name}`)
await c.end()
