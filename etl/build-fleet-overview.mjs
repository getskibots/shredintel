#!/usr/bin/env node
/**
 * build-fleet-overview.mjs — report.fleet_overview (one row per active bot).
 *
 * The data layer for the /#/fleet master dashboard: every bot's usage/traffic
 * rolled up from report.conversation_depth (7d/30d/90d/all windows, prev-30d
 * for the trend delta, a 12-week conversation sparkline, last-active day),
 * joined to name (public.bots), channel (report.bot_channel) and vertical
 * (report.bot_vertical). Aggregate-only, no PII — same anon posture as the
 * other report matviews. Nightly refresh picks it up automatically
 * (refresh_all_materialized_views auto-discovers report.* matviews).
 *
 * Window semantics match the per-bot dashboard: day = conversation
 * started_at::date (UTC), floor 2024-10-01.
 *
 * Prod write, idempotent.  node build-fleet-overview.mjs
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
await c.query(`set statement_timeout = '10min'`)

await c.query('drop materialized view if exists report.fleet_overview cascade')
await c.query(`create materialized view report.fleet_overview as
  with windows as (
    select bot_id,
           sum(conversations) filter (where day >= current_date - 7)                                as conv_7d,
           sum(conversations) filter (where day >= current_date - 30)                               as conv_30d,
           sum(conversations) filter (where day >= current_date - 60 and day < current_date - 30)   as conv_prev_30d,
           sum(conversations) filter (where day >= current_date - 90)                               as conv_90d,
           sum(conversations)                                                                       as conv_all,
           sum(engaged_conversations) filter (where day >= current_date - 30)                       as engaged_30d,
           sum(engaged_conversations)                                                               as engaged_all,
           sum(total_messages) filter (where day >= current_date - 30)                              as messages_30d,
           sum(user_messages)  filter (where day >= current_date - 30)                              as user_messages_30d,
           max(day) filter (where conversations > 0)                                                as last_active
      from report.conversation_depth
     group by bot_id
  ),
  -- 12 aligned weekly buckets (zero-filled) so every sparkline has the same x-axis
  weeks as (
    select generate_series(
             date_trunc('week', current_date) - interval '11 weeks',
             date_trunc('week', current_date), '1 week')::date as wk
  ),
  weekly as (
    select bot_id, date_trunc('week', day)::date as wk, sum(conversations) as convs
      from report.conversation_depth
     where day >= date_trunc('week', current_date) - interval '11 weeks'
     group by bot_id, date_trunc('week', day)
  ),
  spark as (
    select b.id as bot_id,
           jsonb_agg(coalesce(w.convs, 0) order by weeks.wk) as spark_12w
      from public.bots b
     cross join weeks
      left join weekly w on w.bot_id = b.id and w.wk = weeks.wk
     group by b.id
  )
  select b.id                                as bot_id,
         coalesce(b.name, 'Bot ' || b.id)    as name,
         coalesce(bc.channel, 'chat')        as channel,
         coalesce(bv.vertical, 'generic')    as vertical,
         coalesce(wd.conv_7d, 0)::int        as conv_7d,
         coalesce(wd.conv_30d, 0)::int       as conv_30d,
         coalesce(wd.conv_prev_30d, 0)::int  as conv_prev_30d,
         coalesce(wd.conv_90d, 0)::int       as conv_90d,
         coalesce(wd.conv_all, 0)::bigint    as conv_all,
         coalesce(wd.engaged_30d, 0)::int    as engaged_30d,
         coalesce(wd.engaged_all, 0)::bigint as engaged_all,
         coalesce(wd.messages_30d, 0)::int   as messages_30d,
         coalesce(wd.user_messages_30d, 0)::int as user_messages_30d,
         wd.last_active                      as last_active,
         sp.spark_12w                        as spark_12w
    from public.bots b
    left join windows            wd on wd.bot_id = b.id
    left join report.bot_channel bc on bc.bot_id = b.id
    left join report.bot_vertical bv on bv.bot_id = b.id
    left join spark              sp on sp.bot_id = b.id`)

await c.query('create unique index fleet_overview_pk on report.fleet_overview (bot_id)')
await c.query('grant select on report.fleet_overview to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

const { rows: [t] } = await c.query(`
  select count(*)::int bots,
         count(*) filter (where conv_30d > 0)::int active_30d,
         sum(conv_30d)::bigint conv_30d,
         sum(engaged_30d)::bigint engaged_30d,
         sum(messages_30d)::bigint messages_30d
    from report.fleet_overview`)
console.log('✓ report.fleet_overview built + granted')
console.log(`  ${t.bots} bots (${t.active_30d} active last 30d) · 30d fleet: ${t.conv_30d} conversations / ${t.engaged_30d} engaged / ${t.messages_30d} messages`)

// sanity: top 5 by 30d traffic
const { rows: top } = await c.query(`
  select bot_id, name, channel, vertical, conv_30d, engaged_30d
    from report.fleet_overview order by conv_30d desc limit 5`)
for (const r of top) console.log(`  #${r.bot_id} ${r.name} [${r.channel}/${r.vertical}] — ${r.conv_30d} conv / ${r.engaged_30d} engaged (30d)`)
await c.end()
