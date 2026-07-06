-- report.conversation_time — the resort-LOCAL time-spine, one row per conversation.
-- Built by etl/build-conversation-time.mjs (this file is the versioned reference).
-- Refreshed nightly via the MATVIEWS list in sync.mjs (after conversation_page).
--
-- Stamps each session with its local start time + derived buckets, using the
-- resort's zone from report.bot_timezone. Enables "Sun Jul 5 · 1:18 PM · 30 min"
-- in drilling and time-of-day / day-of-week / date-range querying in the resort's
-- own calendar. started_at is `timestamp without time zone` holding UTC → convert
-- with `at time zone 'UTC' at time zone <tz>`.
--
-- ADDITIVE: `day` stays the UTC date (matches the current dashboard, so drill
-- counts still tie out); day_local/hour_local/dow/… are NEW. It's also a superset
-- of the drill dimensions, so ConversationExplorer reads THIS one view for every
-- drill and shows the time. Anon-granted; no message text (PII stays in
-- /api/transcript).

create materialized view report.conversation_time as
with src as (
  select ci.bot_id, ci.conversation_id, ci.day, ci.substantive,
         ci.section, ci.pinchpoint, ci.sentiment, ci.topic,
         cp.funnel_stage, cp.page_path,
         cv.started_at, cv.last_message_date_time as ended_at,
         (cv.started_at at time zone 'UTC' at time zone coalesce(tz.tz, 'America/Denver')) as started_local
    from report.conversation_intel ci
    join raw.admin_conversation cv on cv.id = ci.conversation_id
    left join report.conversation_page cp on cp.conversation_id = ci.conversation_id
    left join report.bot_timezone tz on tz.bot_id = ci.bot_id
)
select bot_id, conversation_id, day, substantive, section, pinchpoint, sentiment, topic,
       funnel_stage, page_path, started_at, ended_at, started_local,
       started_local::date                    as day_local,
       extract(hour  from started_local)::int  as hour_local,
       trim(to_char(started_local, 'Dy'))      as dow,
       extract(isodow from started_local)::int as isodow,
       extract(week   from started_local)::int as iso_week,
       extract(month  from started_local)::int as month_local,
       greatest(extract(epoch from (ended_at - started_at))::int, 0) as duration_sec,
       (started_at::date <> ended_at::date)    as spans_days
  from src;

create index on report.conversation_time (bot_id, day);
create index on report.conversation_time (bot_id, funnel_stage);
create index on report.conversation_time (bot_id, hour_local);
grant select on report.conversation_time to anon, authenticated;
