#!/usr/bin/env node
/**
 * build-voice-views.mjs — VOICE analytics views.
 *
 * Grain fix (2026-07-07): the voice base is the set of VOICE_TWILIO conversations
 * (raw.admin_user.platform='VOICE_TWILIO'), NOT raw.admin_call. admin_call only logs
 * CONNECTED/recorded calls and misses ~41% of voice (17.5k call rows vs 29.7k voice
 * convs). So we base on conversations and LEFT JOIN admin_call for the connected-call
 * detail (recording, phone-geo). The gap (voice convs with no call record) is a real
 * KPI: the call-abandon / didn't-connect rate — a metric chat has no analog for.
 *
 * A voice call IS a conversation, so transcript + enrichment already live in the chat
 * pipeline (report.conversation_intel, keyed by conversation_id). Resort-local day/
 * hour via report.bot_timezone. Duration = median only (closed_at−started_at has
 * multi-day outliers; no true duration in the mirror — Twilio API is the moat later).
 *
 * Run AFTER enrich.mjs on the voice bots. Idempotent. Prod write.
 *   node build-voice-views.mjs
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='600000ms'")
console.log('connected. building voice views (run this ONCE — no concurrent runs)…')

// ── call_base: one row per VOICE CONVERSATION (the voice drill spine). Base = all
//    VOICE_TWILIO convs; LEFT JOIN one admin_call (prefer the recorded one) for the
//    connected-call detail. `connected` = a call record exists. ────────────────────
console.log('  · call_base (voice conversations + call detail + enrichment) …')
await c.query('drop materialized view if exists report.call_base cascade')
await c.query(`create materialized view report.call_base as
  with voice_conv as (
    -- start from VOICE_TWILIO users so we don't drag the full 900k-conversation
    -- scan; index-join to their conversations.
    select cv.id as conversation_id, cv.started_at, cv.closed_at, cv.outcome, u.bot_id
    from raw.admin_user u
    join raw.admin_conversation cv on cv.user_id = u.id
    where u.platform = 'VOICE_TWILIO' and cv.started_at >= '2024-10-01'
  )
  select
    vc.bot_id, vc.conversation_id,
    ac.id as call_id, ac.call_sid, ac.recording_sid,
    ((vc.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/Denver'))::date as day,
    extract(hour from ((vc.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/Denver')))::int as hour_local,
    greatest(extract(epoch from (vc.closed_at - vc.started_at)), 0)::int as dur_sec,
    vc.outcome,
    (ac.id is not null) as connected,
    (vc.outcome is distinct from 'UNENGAGED') as engaged,
    nullif(ac.from_country,'') as from_country,
    initcap(lower(nullif(ac.from_city,''))) as from_city,
    ci.substantive, ci.section, ci.pinchpoint, ci.sentiment, ci.urgency, ci.handover, ci.topic
  from voice_conv vc
  left join lateral (
    select a.id, a.call_sid, a.recording_sid, a.from_country, a.from_city
    from raw.admin_call a
    where a.conversation_id = vc.conversation_id
    order by (a.recording_sid is not null) desc, a.id desc
    limit 1
  ) ac on true
  left join report.bot_timezone tz on tz.bot_id = vc.bot_id
  left join report.conversation_intel ci on ci.conversation_id = vc.conversation_id`)
await c.query('create unique index call_base_pk on report.call_base (conversation_id)')
await c.query('create index call_base_bot_day on report.call_base (bot_id, day)')
await c.query('grant select on report.call_base to anon, authenticated')

// ── call_volume: per bot/day — total voice sessions, connected vs abandoned (the new
//    KPI), engaged, handover, MEDIAN duration (connected only). ─────────────────────
console.log('  · call_volume …')
await c.query('drop materialized view if exists report.call_volume cascade')
await c.query(`create materialized view report.call_volume as
  select bot_id, day,
    count(*)::int voice_convs,
    count(*) filter (where connected)::int connected_calls,
    count(*) filter (where not connected)::int unconnected,
    round(100.0 * count(*) filter (where not connected) / nullif(count(*),0))::int abandon_pct,
    count(*) filter (where engaged)::int engaged_calls,
    count(*) filter (where handover in ('Possible Handover','Clear Handover'))::int handover_calls,
    (percentile_cont(0.5) within group (order by dur_sec)
       filter (where connected and dur_sec between 1 and 3600))::int median_dur_sec,
    count(*) filter (where outcome = 'UNENGAGED')::int unengaged
  from report.call_base group by bot_id, day`)
await c.query('create unique index call_volume_pk on report.call_volume (bot_id, day)')
await c.query('grant select on report.call_volume to anon, authenticated')

// ── call_geo: per bot/day/city — phone-based, connected calls only (only they carry
//    geo). `day` lets the dashboard period-scope the caller map like chat's geo_city. ──
console.log('  · call_geo …')
await c.query('drop materialized view if exists report.call_geo cascade')
// Geocode the phone cities by reusing the MaxMind coords already in report.ip_geo
// (internal-only, has raw IP). We read it here (service creds) and emit only the
// aggregated city + a representative lat/lon into call_geo (anon-granted, no raw IP).
// Match on (city, country); ~93% of bot-248's calls resolve, incl. Calgary/Edmonton.
await c.query(`create materialized view report.call_geo as
  with city_coord as (
    select lower(city) city_l, country_iso,
      avg(lat)::double precision lat, avg(lon)::double precision lon
    from report.ip_geo where city is not null and lat is not null
    group by lower(city), country_iso
  )
  select cb.bot_id, cb.day, cb.from_country, cb.from_city,
    cc.lat as from_lat, cc.lon as from_lon,
    count(*)::int calls, count(*) filter (where cb.engaged)::int engaged_calls
  from report.call_base cb
  left join city_coord cc
    on cc.city_l = lower(cb.from_city) and cc.country_iso = cb.from_country
  where cb.from_country is not null
  group by cb.bot_id, cb.day, cb.from_country, cb.from_city, cc.lat, cc.lon`)
await c.query('create index call_geo_bot_day on report.call_geo (bot_id, day)')
await c.query('grant select on report.call_geo to anon, authenticated')

// ── call_hours: per bot/day/local-hour — ALL voice sessions (staffing needs the missed
//    ones too), plus the connected subset. `day` lets the dashboard period-scope the
//    peak-hours view like chat's demand_heatmap. ────────────────────────────────────
console.log('  · call_hours …')
await c.query('drop materialized view if exists report.call_hours cascade')
await c.query(`create materialized view report.call_hours as
  select bot_id, day, hour_local,
    count(*)::int calls,
    count(*) filter (where connected)::int connected_calls,
    count(*) filter (where engaged)::int engaged_calls
  from report.call_base group by bot_id, day, hour_local`)
await c.query('create unique index call_hours_pk on report.call_hours (bot_id, day, hour_local)')
await c.query('grant select on report.call_hours to anon, authenticated')

await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ voice views built + granted: call_base, call_volume, call_geo, call_hours')

// ── verify vs bot 248 (Voice - Mtn Collective) ──
const v = (await c.query(`select
  sum(voice_convs)::int voice_convs, sum(connected_calls)::int connected, sum(unconnected)::int unconnected,
  round(100.0*sum(unconnected)/nullif(sum(voice_convs),0))::int abandon_pct,
  sum(engaged_calls)::int engaged, sum(handover_calls)::int handover,
  round(avg(median_dur_sec))::int median_dur
  from report.call_volume where bot_id=248`)).rows[0]
console.log(`\nbot 248: ${v.voice_convs} voice convs · ${v.connected} connected (${v.unconnected} unconnected = ${v.abandon_pct}% abandon) · ${v.engaged} engaged · ${v.handover} handover-flagged · ~${v.median_dur}s median`)
console.log('top caller cities:', (await c.query(`select from_city, sum(calls)::int n from report.call_geo where bot_id=248 and from_city is not null group by from_city order by n desc limit 8`)).rows.map(r=>`${r.from_city} ${r.n}`).join(' · '))
console.log('busiest local hours:', (await c.query(`select hour_local, sum(calls)::int calls from report.call_hours where bot_id=248 group by hour_local order by calls desc limit 5`)).rows.map(r=>`${r.hour_local}:00 (${r.calls})`).join(' · '))
await c.end()
console.log('\ndone.')
