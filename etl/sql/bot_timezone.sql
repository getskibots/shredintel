-- report.bot_timezone — per-resort IANA timezone, so the report layer can compute
-- resort-LOCAL dates + times instead of UTC. Built + seeded + verified by
-- etl/build-bot-timezone.mjs (this file is the version-controlled reference).
--
-- Why: the mirror stores UTC. Resorts span Eastern → Pacific, Canada, Arizona
-- (no DST), and Chile (southern hemisphere). UTC date-bucketing misfiles ~1 in 4
-- conversations onto the wrong resort-calendar day. This table is the prerequisite
-- for the resort-local date re-base (report.conversation_time). It has NO live
-- impact until a consumer reads it.
--
-- Verified 2026-07-05: 32/34 bots' overnight activity trough lands at 1-5am in
-- their assigned zone. The 2 exceptions are a voice line (252, different usage
-- curve) + a low-volume bot (143 Alta), both correctly located by geography.

create table if not exists report.bot_timezone (
  bot_id     integer primary key,
  tz         text not null,                    -- IANA zone, e.g. 'America/Denver'
  source     text not null default 'mapped',   -- 'mapped' = known location; 'review' = verify
  updated_at timestamptz not null default now()
);

-- Local conversion pattern (started_at is `timestamp without time zone` holding UTC):
--   started_at at time zone 'UTC' at time zone bt.tz   →  resort-local timestamp
-- Coalesce to a default zone (America/Denver) for any bot not yet mapped.
