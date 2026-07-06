#!/usr/bin/env node
/**
 * build-conversation-time.mjs — the resort-LOCAL time-spine, one row per
 * conversation. Stamps every session with its local start time + derived buckets
 * (hour, day-of-week, week, month, duration) using each bot's zone from
 * report.bot_timezone. This is what lets drilling say "Sun Jul 5 · 1:18 PM · 30 min"
 * and lets the AI answer time-of-day / day-of-week / date-range questions in the
 * resort's own calendar.
 *
 * ADDITIVE + non-destructive: `day` stays the UTC date (matches the current
 * dashboard so drill counts still tie out); day_local/hour_local/etc. are NEW,
 * for display + future local re-base. It's a superset of the drill dimensions
 * (section/pinchpoint/sentiment/topic/funnel_stage) so ConversationExplorer can
 * read this ONE view for every drill AND show the time.
 *
 * started_at is `timestamp without time zone` holding UTC → convert with
 * `at time zone 'UTC' at time zone <resort tz>`. Run after build-page-funnel.mjs
 * + build-bot-timezone.mjs. Idempotent.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='240000ms'")

console.log('Building report.conversation_time …')
await c.query('drop materialized view if exists report.conversation_time cascade')
await c.query(`
  create materialized view report.conversation_time as
  with src as (
    select ci.bot_id, ci.conversation_id, ci.day, ci.substantive,
           ci.section, ci.pinchpoint, ci.sentiment, ci.topic,
           cp.funnel_stage, cp.page_path,
           g.country_iso, g.country_name, g.region, g.city, g.lat, g.lon,
           cv.started_at, cv.last_message_date_time as ended_at,
           (cv.started_at at time zone 'UTC' at time zone coalesce(tz.tz, 'America/Denver')) as started_local
      from report.conversation_intel ci
      join raw.admin_conversation cv on cv.id = ci.conversation_id
      left join report.conversation_page cp on cp.conversation_id = ci.conversation_id
      left join report.bot_timezone tz on tz.bot_id = ci.bot_id
      left join raw.admin_user u on u.id = cv.user_id
      left join report.ip_geo g on g.ip = u.ip_address
  )
  select bot_id, conversation_id, day, substantive, section, pinchpoint, sentiment, topic,
         funnel_stage, page_path, country_iso, country_name, region, city, lat, lon,
         started_at, ended_at, started_local,
         started_local::date                         as day_local,
         extract(hour  from started_local)::int       as hour_local,
         trim(to_char(started_local, 'Dy'))           as dow,
         extract(isodow from started_local)::int      as isodow,
         extract(week   from started_local)::int      as iso_week,
         extract(month  from started_local)::int      as month_local,
         greatest(extract(epoch from (ended_at - started_at))::int, 0) as duration_sec,
         (started_at::date <> ended_at::date)         as spans_days
    from src`)
await c.query('create index on report.conversation_time (bot_id, day)')
await c.query('create index on report.conversation_time (bot_id, funnel_stage)')
await c.query('create index on report.conversation_time (bot_id, hour_local)')
await c.query('grant select on report.conversation_time to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.conversation_time created + granted + PostgREST reloaded')

// verify vs bot 43
const { rows: sample } = await c.query(`
  select conversation_id, to_char(started_local,'Dy Mon DD HH24:MI') local_start, hour_local, dow, duration_sec, spans_days
  from report.conversation_time where bot_id=43 and started_at is not null
  order by started_at desc limit 5`)
console.log('\nsample (bot 43):'); console.table(sample)

const { rows: [cov] } = await c.query(`
  select count(*) rows, count(started_local) with_time,
         count(*) filter (where spans_days) spans_days,
         min(hour_local) minh, max(hour_local) maxh
  from report.conversation_time where bot_id=43`)
console.log(`\ncoverage bot 43: ${cov.with_time}/${cov.rows} stamped · spans_days=${cov.spans_days} · hour range ${cov.minh}-${cov.maxh}`)

const { rows: hrs } = await c.query(`
  select hour_local, count(*) n from report.conversation_time where bot_id=43
  group by hour_local order by n asc limit 3`)
console.log('quietest local hours (should be 1-5am):', hrs.map(h=>`${h.hour_local}:00(${h.n})`).join('  '))
await c.end()
