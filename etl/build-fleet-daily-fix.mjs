#!/usr/bin/env node
/**
 * build-fleet-daily-fix.mjs — report.fleet_daily_fix, the one-row-per-day
 * fleet heartbeat behind the "Daily Fix" tab (and, later, the public ski-weather
 * image). Rolls EVERY bot's daily signal into one row: volume + channel split,
 * mood (sentiment), signal (urgency / wanted-a-human / resolution), what guests
 * asked (categories jsonb), the fun flavor tags (jsonb), voice activity, and
 * Twilio + OpenAI cost.
 *
 * Restricted to the active registry (public.bots) so it reconciles with the rest
 * of Master'Botter. Aggregate-only, anon-safe. Refreshed nightly on the droplet.
 *
 * ⚠️ COMPLETENESS: the current UTC day is always partial (enrichment runs
 * overnight), so the frontend must read the last COMPLETE day, not max(day).
 * This view exposes every day; the "is today settled yet" call is the reader's.
 *
 * Prod write, idempotent.  node build-fleet-daily-fix.mjs
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

await c.query('drop materialized view if exists report.fleet_daily_fix cascade')
await c.query(`create materialized view report.fleet_daily_fix as
  with reg as (select id from public.bots),
  vol as (
    select cd.day,
           sum(cd.conversations)                                          as conversations,
           sum(cd.engaged_conversations)                                  as engaged,
           sum(cd.total_messages)                                         as messages,
           sum(cd.conversations) filter (where bc.channel = 'voice')      as voice_conversations,
           sum(cd.conversations) filter (where bc.channel is distinct from 'voice') as chat_conversations
      from report.conversation_depth cd
      join reg on reg.id = cd.bot_id
      left join report.bot_channel bc on bc.bot_id = cd.bot_id
     group by cd.day
  ),
  intel as (
    select ci.day,
           count(*) filter (where ci.substantive)                                       as substantive,
           count(*) filter (where ci.sentiment = 'Positive')                            as positive,
           count(*) filter (where ci.sentiment = 'Neutral')                             as neutral,
           count(*) filter (where ci.sentiment = 'Negative')                            as negative,
           count(*) filter (where ci.urgency ilike 'High%')                             as high_urgency,
           count(*) filter (where ci.handover is not null and ci.handover not in ('None','')) as wanted_human,
           count(*) filter (where ci.resolution = 'Resolved')                           as resolved,
           count(*) filter (where ci.resolution = 'Partial')                            as partial,
           count(*) filter (where ci.resolution = 'Unresolved')                         as unresolved
      from report.conversation_intel ci
      join reg on reg.id = ci.bot_id
     group by ci.day
  ),
  cats as (
    select day, jsonb_object_agg(category, n) as categories
      from (select ci.day, ci.category, count(*) n from report.conversation_intel ci
              join reg on reg.id = ci.bot_id
             where ci.category is not null group by ci.day, ci.category) x
     group by day
  ),
  flav as (
    select day, jsonb_object_agg(flavor, n) as flavors
      from (select ci.day, ci.flavor, count(*) n from report.conversation_intel ci
              join reg on reg.id = ci.bot_id
             where ci.flavor is not null and ci.flavor not in ('None','none','') group by ci.day, ci.flavor) x
     group by day
  ),
  vc as (
    select day, sum(calls) voice_calls, sum(minutes) voice_minutes,
           sum(cost_usd) + sum(recording_usd) twilio_usd
      from report.voice_cost_daily group by day
  ),
  ai as (select day, sum(cost_usd) openai_usd from report.openai_cost_daily group by day)
  select v.day,
         coalesce(v.conversations, 0)::int        as conversations,
         coalesce(v.engaged, 0)::int              as engaged,
         coalesce(v.messages, 0)::int             as messages,
         coalesce(v.chat_conversations, 0)::int   as chat_conversations,
         coalesce(v.voice_conversations, 0)::int  as voice_conversations,
         coalesce(i.substantive, 0)::int          as substantive,
         coalesce(i.positive, 0)::int             as positive,
         coalesce(i.neutral, 0)::int              as neutral,
         coalesce(i.negative, 0)::int             as negative,
         coalesce(i.high_urgency, 0)::int         as high_urgency,
         coalesce(i.wanted_human, 0)::int         as wanted_human,
         coalesce(i.resolved, 0)::int             as resolved,
         coalesce(i.partial, 0)::int              as partial,
         coalesce(i.unresolved, 0)::int           as unresolved,
         coalesce(vc.voice_calls, 0)::int         as voice_calls,
         round(coalesce(vc.voice_minutes, 0))::int as voice_minutes,
         round(coalesce(vc.twilio_usd, 0), 2)     as twilio_usd,
         round(coalesce(ai.openai_usd, 0), 2)     as openai_usd,
         coalesce(cats.categories, '{}'::jsonb)   as categories,
         coalesce(flav.flavors, '{}'::jsonb)      as flavors
    from vol v
    left join intel i  on i.day = v.day
    left join cats     on cats.day = v.day
    left join flav     on flav.day = v.day
    left join vc       on vc.day = v.day
    left join ai       on ai.day = v.day`)

await c.query('create unique index fleet_daily_fix_pk on report.fleet_daily_fix (day)')
await c.query('grant select on report.fleet_daily_fix to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// preview the last complete day (exclude the partial current UTC day)
const { rows: [r] } = await c.query(`
  select * from report.fleet_daily_fix
   where day < (now() at time zone 'utc')::date and substantive > 0
   order by day desc limit 1`)
console.log('✓ report.fleet_daily_fix built + granted')
if (r) {
  const pct = (n) => (r.substantive ? Math.round((100 * n) / r.substantive) : 0)
  const topCats = Object.entries(r.categories).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(' · ')
  const flav = Object.entries(r.flavors).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none tagged'
  console.log(`\n  === Daily Fix · ${String(r.day).slice(0, 15)} (last complete day) ===`)
  console.log(`  VOLUME: ${r.conversations} conversations (${r.chat_conversations} chat / ${r.voice_conversations} voice) · ${r.messages} messages`)
  console.log(`  MOOD:   ${r.positive} positive / ${r.neutral} neutral / ${r.negative} negative  (${pct(r.positive)}% positive of ${r.substantive})`)
  console.log(`  SIGNAL: ${r.high_urgency} high-urgency · ${r.wanted_human} wanted a human · ${pct(r.resolved)}% resolved`)
  console.log(`  ASKS:   ${topCats}`)
  console.log(`  FLAVOR: ${flav}`)
  console.log(`  COST:   Twilio $${r.twilio_usd} + OpenAI $${r.openai_usd}`)
}
await c.end()
