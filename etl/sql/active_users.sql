-- report.active_users(bot_id, from, to) → distinct users (visitors) in a window.
--
-- Why an RPC: "distinct users in a date range" cannot be summed from the daily
-- report.* rows (a returning user active on N days would be counted N times).
-- This function computes the true window-level distinct, matching the Botscrew
-- admin "Active users" number (verified: bot 43, 2025-07-01..2026-06-30 → 43,282
-- vs Botscrew 43,269, a 0.03% difference from date-boundary rounding).
--
-- SECURITY DEFINER so the anon role (which cannot read raw.*) can call it; it
-- only ever returns a single COUNT — no row-level or PII exposure. Uses
-- started_at (same conversation-date basis the report views resolve to).
--
-- Applied to the live DB 2026-07-04. Re-run to recreate.

create or replace function report.active_users(p_bot_id integer, p_from date, p_to date)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $func$
  select count(distinct ac.user_id)::bigint
  from raw.admin_conversation ac
  join raw.admin_user au on au.id = ac.user_id
  where au.bot_id = p_bot_id
    and ac.started_at >= p_from::timestamp
    and ac.started_at < (p_to::timestamp + interval '1 day')
$func$;

revoke all on function report.active_users(integer, date, date) from public;
grant execute on function report.active_users(integer, date, date) to anon, authenticated;
