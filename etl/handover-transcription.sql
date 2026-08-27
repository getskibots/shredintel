-- Handover transcription — schema for transcribing the HUMAN / escalation half of
-- transferred voice calls (Whisper whisper-1) + voicemail detection.
-- Applied to Supabase 2026-08-27. Pipeline: etl/transcribe-handover.mjs.

-- 1) Storage. PII (guest-voice transcript text) → service-role ONLY, never anon.
create table if not exists report.call_handover_transcript (
  conversation_id bigint primary key,
  bot_id          int,
  call_sid        text,
  recording_sid   text,
  offset_sec      int,        -- seconds into the recording where the human leg starts
  segment_sec     numeric,    -- transcribed audio length (Whisper-reported)
  text            text,
  is_voicemail    boolean,    -- greeting/one-sided detection (VMAIL_RX in the pipeline)
  model           text,
  cost_usd        numeric,
  transcribed_at  timestamptz default now()
);
revoke select on report.call_handover_transcript from anon;
revoke select on report.call_handover_transcript from authenticated;

-- 2) Aggregate views — COUNTS only, no transcript text → safe to expose to anon.
create or replace view report.handover_outcome as
  select t.bot_id,
         count(*)::int transfers,
         count(*) filter (where t.is_voicemail)::int      voicemail,
         count(*) filter (where not t.is_voicemail)::int  connected,
         round(100.0*count(*) filter (where t.is_voicemail)/nullif(count(*),0))::int voicemail_pct,
         round(avg(t.segment_sec))::int avg_seg_sec
  from report.call_handover_transcript t
  group by t.bot_id;
grant select on report.handover_outcome to anon, authenticated;

create or replace view report.handover_by_hour as
  select t.bot_id,
         extract(hour from ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/New_York')))::int hour_local,
         count(*)::int transfers,
         count(*) filter (where t.is_voicemail)::int voicemail
  from report.call_handover_transcript t
  join raw.admin_conversation cv on cv.id = t.conversation_id
  left join report.bot_timezone tz on tz.bot_id = t.bot_id
  group by t.bot_id, 2;
grant select on report.handover_by_hour to anon, authenticated;

-- 3) Period-aware RPC used by the Voice dashboard. SECURITY DEFINER so anon can call
-- it WITHOUT direct access to the PII table — it returns only counts, never text.
-- Resort-local day/hour (matches the rest of the voice page).
create or replace function report.handover_stats(p_bot_id int, p_from date, p_to date)
returns json language sql security definer stable set search_path = report, raw, public as $fn$
  with base as (
    select t.is_voicemail,
           (((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/New_York')))::date d,
           extract(hour from ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz,'America/New_York')))::int hour_local
    from report.call_handover_transcript t
    join raw.admin_conversation cv on cv.id = t.conversation_id
    left join report.bot_timezone tz on tz.bot_id = t.bot_id
    where t.bot_id = p_bot_id
  ), win as (
    select * from base where d >= p_from and d <= p_to
  )
  select json_build_object(
    'transfers', (select count(*) from win),
    'voicemail', (select count(*) filter (where is_voicemail) from win),
    'connected', (select count(*) filter (where not is_voicemail) from win),
    'by_hour', coalesce((
      select json_agg(json_build_object('hour', hour_local, 'transfers', c, 'voicemail', v) order by hour_local)
      from (select hour_local, count(*) c, count(*) filter (where is_voicemail) v from win group by hour_local) h
    ), '[]'::json)
  );
$fn$;
grant execute on function report.handover_stats(int,date,date) to anon, authenticated;
