#!/usr/bin/env node
/**
 * build-fleet-usage-rpc.mjs — report.fleet_usage(p_from, p_to): the date-ranged
 * companion to report.fleet_overview, powering the /#/fleet PeriodPicker.
 *
 * One row per bot for ANY [from, to] window: conversations / engaged / messages,
 * the equal-length PRIOR window's conversations (trend delta), an adaptive spark
 * (≤12 equal buckets across the range, zero-filled), and the Twilio voice cost
 * rollup (calls / minutes / $ from report.voice_cost_daily).
 *
 * SECURITY DEFINER (same pattern as report.active_users): anon can execute but
 * only aggregate numbers come back — the underlying cost table stays locked.
 *
 * Prod write, idempotent.  node build-fleet-usage-rpc.mjs
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

// return-type changes (new OUT columns) require a drop first
await c.query('drop function if exists report.fleet_usage(date, date)')
await c.query(`
create or replace function report.fleet_usage(p_from date, p_to date)
returns table (
  bot_id             bigint,
  conversations      bigint,
  engaged            bigint,
  messages           bigint,
  user_messages      bigint,
  prev_conversations bigint,
  spark              jsonb,
  voice_calls        bigint,
  voice_minutes      numeric,
  voice_cost_usd     numeric,
  voice_rental_usd   numeric,
  voice_recording_usd numeric,
  ai_cost_usd        numeric,
  botscrew_usd       numeric
)
language sql stable security definer
set search_path = report, public
as $fn$
  with span as (
    select greatest(1, p_to - p_from + 1)          as nd,
           least(greatest(1, p_to - p_from + 1), 12) as nb
  ),
  cur as (
    select cd.bot_id,
           sum(cd.conversations)         as conv,
           sum(cd.engaged_conversations) as eng,
           sum(cd.total_messages)        as msgs,
           sum(cd.user_messages)         as umsgs
      from report.conversation_depth cd
     where cd.day between p_from and p_to
     group by cd.bot_id
  ),
  prev as (
    select cd.bot_id, sum(cd.conversations) as conv
      from report.conversation_depth cd, span
     where cd.day >= p_from - span.nd and cd.day < p_from
     group by cd.bot_id
  ),
  -- adaptive spark: the range split into nb equal buckets, zero-filled
  bucketed as (
    select cd.bot_id,
           least(span.nb, 1 + ((cd.day - p_from) * span.nb) / span.nd) as b,
           sum(cd.conversations) as conv
      from report.conversation_depth cd, span
     where cd.day between p_from and p_to
     group by cd.bot_id, 2
  ),
  spark as (
    select bots.bot_id, jsonb_agg(coalesce(bk.conv, 0) order by bx.b) as sp
      from (select distinct bucketed.bot_id from bucketed) bots
     cross join (select generate_series(1, span.nb) as b from span) bx
      left join bucketed bk on bk.bot_id = bots.bot_id and bk.b = bx.b
     group by bots.bot_id
  ),
  vc as (
    select v.bot_id,
           sum(v.calls)::bigint  as calls,
           sum(v.minutes)       as minutes,
           sum(v.cost_usd)      as cost_usd,
           sum(v.rental_usd)    as rental_usd,
           sum(v.recording_usd) as recording_usd
      from report.voice_cost_daily v
     where v.day between p_from and p_to
     group by v.bot_id
  ),
  ai as (
    select o.bot_id, sum(o.cost_usd) as cost_usd
      from report.openai_cost_daily o
     where o.day between p_from and p_to
     group by o.bot_id
  )
  select b.id                         as bot_id,
         coalesce(cur.conv, 0)::bigint  as conversations,
         coalesce(cur.eng, 0)::bigint   as engaged,
         coalesce(cur.msgs, 0)::bigint  as messages,
         coalesce(cur.umsgs, 0)::bigint as user_messages,
         coalesce(prev.conv, 0)::bigint as prev_conversations,
         spark.sp                       as spark,
         coalesce(vc.calls, 0)::bigint  as voice_calls,
         coalesce(vc.minutes, 0)        as voice_minutes,
         coalesce(vc.cost_usd, 0)       as voice_cost_usd,
         coalesce(vc.rental_usd, 0)     as voice_rental_usd,
         coalesce(vc.recording_usd, 0)  as voice_recording_usd,
         coalesce(ai.cost_usd, 0)       as ai_cost_usd,
         -- Botscrew platform fee: $40/mo per live-production bot ("ACTIVE" in name),
         -- prorated to the window at $40 per 30 days (so "Last 30 days" = $40).
         -- Assumes the bot was live the whole window — best for recent windows.
         case when b.name ilike '%active%'
              then round(40.0 * (p_to - p_from + 1) / 30.0, 2)
              else 0 end                as botscrew_usd
    from public.bots b
    left join cur   on cur.bot_id   = b.id
    left join prev  on prev.bot_id  = b.id
    left join spark on spark.bot_id = b.id
    left join vc    on vc.bot_id    = b.id
    left join ai    on ai.bot_id    = b.id
$fn$`)

await c.query('grant execute on function report.fleet_usage(date, date) to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// sanity: 30d window should tie out to fleet_overview's conv_30d
const { rows: [x] } = await c.query(`
  select (select sum(conversations) from report.fleet_usage(current_date - 30, current_date - 1)) rpc,
         (select sum(conv_30d) from report.fleet_overview) mv`)
console.log(`✓ report.fleet_usage created + granted · 30d cross-check rpc=${x.rpc} vs matview=${x.mv} ${String(x.rpc) === String(x.mv) ? '✓ match' : '⚠ differs (windows may differ by a day)'}`)
const { rows: top } = await c.query(`
  select bot_id, voice_cost_usd, voice_recording_usd, ai_cost_usd, botscrew_usd,
         round(voice_cost_usd + voice_recording_usd + ai_cost_usd + botscrew_usd, 2) as total
    from report.fleet_usage(current_date - 30, current_date - 1)
   order by total desc limit 5`)
for (const r of top) console.log(`  bot ${r.bot_id}: voice $${r.voice_cost_usd} + rec $${r.voice_recording_usd} + AI $${r.ai_cost_usd} + botscrew $${r.botscrew_usd} = $${r.total}`)
await c.end()
