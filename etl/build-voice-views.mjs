#!/usr/bin/env node
/**
 * build-voice-views.mjs — VOICE analytics views over raw.admin_call.
 *
 * A voice call IS a conversation (admin_call.conversation_id → admin_conversation),
 * so the transcript + enrichment already live in the chat pipeline. These views add
 * the CALL layer: volume, median duration, outcomes, phone-geo, peak-hours — and
 * join the enrichment (report.conversation_intel) so voice has both the call metrics
 * AND the AI panels in one place. Resort-local day/hour via report.bot_timezone.
 *
 * Grain notes (from recon): calls ≠ 1:1 with conversations (key by call_id).
 * Duration is median-only (closed_at−started_at has 161-day outliers). "Engaged"
 * for voice = outcome is not UNENGAGED (an immediate hang-up); ABANDONED = ended.
 *
 * Run AFTER enrich.mjs on the voice bots (so section/sentiment/handover fill in);
 * the call-metric panels work even before enrichment. Idempotent. Prod write.
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
await c.query("set statement_timeout='300000ms'")

// ── call_base: one row per CALL (the voice drill spine) — call metadata + timing +
//    phone-geo + the enrichment labels joined in. ──────────────────────────────────
await c.query('drop materialized view if exists report.call_base cascade')
await c.query(`create materialized view report.call_base as
  select
    u.bot_id, ac.id as call_id, ac.conversation_id, ac.call_sid, ac.recording_sid,
    ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/Denver'))::date as day,
    extract(hour from ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/Denver')))::int as hour_local,
    greatest(extract(epoch from (cv.closed_at - cv.started_at)), 0)::int as dur_sec,
    cv.outcome,
    (cv.outcome is distinct from 'UNENGAGED') as engaged,
    nullif(ac.from_country,'') as from_country,
    initcap(lower(nullif(ac.from_city,''))) as from_city,
    ci.substantive, ci.section, ci.pinchpoint, ci.sentiment, ci.urgency, ci.handover, ci.topic
  from raw.admin_call ac
  join raw.admin_conversation cv on cv.id = ac.conversation_id
  join raw.admin_user u on u.id = cv.user_id
  left join report.bot_timezone tz on tz.bot_id = u.bot_id
  left join report.conversation_intel ci on ci.conversation_id = ac.conversation_id
  where cv.started_at >= '2024-10-01'`)
await c.query('create unique index call_base_pk on report.call_base (call_id)')
await c.query('create index call_base_bot_day on report.call_base (bot_id, day)')
await c.query('grant select on report.call_base to anon, authenticated')

// ── call_volume: per bot/day — calls, engaged, MEDIAN duration, handover, outcomes ──
await c.query('drop materialized view if exists report.call_volume cascade')
await c.query(`create materialized view report.call_volume as
  select bot_id, day,
    count(*)::int calls,
    count(*) filter (where engaged)::int engaged_calls,
    count(*) filter (where handover in ('Possible Handover','Clear Handover'))::int handover_calls,
    (percentile_cont(0.5) within group (order by dur_sec) filter (where dur_sec between 1 and 3600))::int median_dur_sec,
    count(*) filter (where outcome = 'UNENGAGED')::int unengaged,
    count(*) filter (where outcome = 'ABANDONED')::int abandoned
  from report.call_base group by bot_id, day`)
await c.query('create unique index call_volume_pk on report.call_volume (bot_id, day)')
await c.query('grant select on report.call_volume to anon, authenticated')

// ── call_geo: per bot/city (phone-based; no IP pipeline, no VPN/datacenter junk) ──
await c.query('drop materialized view if exists report.call_geo cascade')
await c.query(`create materialized view report.call_geo as
  select bot_id, from_country, from_city,
    count(*)::int calls, count(*) filter (where engaged)::int engaged_calls
  from report.call_base where from_country is not null
  group by bot_id, from_country, from_city`)
await c.query('create index call_geo_bot on report.call_geo (bot_id)')
await c.query('grant select on report.call_geo to anon, authenticated')

// ── call_hours: per bot/local-hour — the peak-hours / staffing view ──
await c.query('drop materialized view if exists report.call_hours cascade')
await c.query(`create materialized view report.call_hours as
  select bot_id, hour_local, count(*)::int calls, count(*) filter (where engaged)::int engaged_calls
  from report.call_base group by bot_id, hour_local`)
await c.query('create unique index call_hours_pk on report.call_hours (bot_id, hour_local)')
await c.query('grant select on report.call_hours to anon, authenticated')

await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ voice views built + granted: call_base, call_volume, call_geo, call_hours')

// ── verify vs bot 248 (Mtn Collective voice) ──
const v = (await c.query(`select
  sum(calls)::int calls, sum(engaged_calls)::int engaged, sum(handover_calls)::int handover,
  round(avg(median_dur_sec))::int median_dur, sum(abandoned)::int abandoned, sum(unengaged)::int unengaged
  from report.call_volume where bot_id=248`)).rows[0]
console.log(`\nbot 248: ${v.calls} calls · ${v.engaged} engaged · ${v.handover} handover-flagged · ~${v.median_dur}s median · ${v.abandoned} abandoned / ${v.unengaged} unengaged`)
console.log('top caller cities:', (await c.query(`select from_city, sum(calls)::int n from report.call_geo where bot_id=248 and from_city is not null group by from_city order by n desc limit 8`)).rows.map(r=>`${r.from_city} ${r.n}`).join(' · '))
console.log('busiest local hours:', (await c.query(`select hour_local, calls from report.call_hours where bot_id=248 order by calls desc limit 5`)).rows.map(r=>`${r.hour_local}:00 (${r.calls})`).join(' · '))
await c.end()
console.log('\ndone.')
