#!/usr/bin/env node
/**
 * build-ga4.mjs — schema for the GA4 connector (site-wide traffic alongside the
 * bot's own conversation + page-funnel data). Idempotent DDL + seeds the bot 2
 * (Mountain Collective) mapping for the first end-to-end test.
 *
 *   report.bot_ga4          bot_id -> GA4 numeric Property ID (service-role only;
 *                           config, read/written server-side like report.bot_twilio)
 *   report.ga4_traffic_daily   per-day sessions/users/pageviews/events   (anon SELECT)
 *   report.ga4_page_daily      per-day host+path pageviews/sessions       (anon SELECT)
 *   report.ga4_source_daily    per-day source/medium sessions             (anon SELECT)
 *   report.ga4_event_daily     per-day event_name counts (widget events)  (anon SELECT)
 *   report.ga4_page_opportunity  GA4 pageviews x the bot-side page funnel  (anon SELECT)
 *
 * The nightly pull that fills the *_daily tables is etl/ga4-sync.mjs.
 * Run: node build-ga4.mjs
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// --- mapping: bot_id -> GA4 property. Config, NOT anon (read via a server route). ---
await c.query(`
  create table if not exists report.bot_ga4 (
    bot_id          int primary key,
    ga4_property_id text,                                -- numeric GA4 Property ID; NULL until a property is picked
    label           text,
    status          text not null default 'connected',   -- connected | paused | error
    note            text,
    connected_at    timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    last_synced_at  timestamptz,
    last_error      text
  )`)
// OAuth (self-serve "Connect Google Analytics"): the resort's encrypted refresh
// token + the Google account it came from. Refresh token is AES-256-GCM (the same
// tokenCrypto/TWILIO_TOKEN_ENC_KEY used for Twilio) — server-only, never anon.
await c.query('alter table report.bot_ga4 add column if not exists oauth_refresh_token_enc text')
await c.query('alter table report.bot_ga4 add column if not exists oauth_email text')
await c.query('alter table report.bot_ga4 add column if not exists oauth_connected_at timestamptz')
await c.query('revoke all on report.bot_ga4 from anon, authenticated')

// --- pulled aggregates: anon-readable, no PII (all counts). Populated by ga4-sync.mjs. ---
await c.query(`
  create table if not exists report.ga4_traffic_daily (
    bot_id    int  not null,
    day       date not null,
    sessions  int  not null default 0,
    users     int  not null default 0,
    pageviews int  not null default 0,
    events    int  not null default 0,
    primary key (bot_id, day)
  )`)
await c.query(`
  create table if not exists report.ga4_page_daily (
    bot_id    int  not null,
    day       date not null,
    host      text not null default '',
    page_path text not null default '',
    full_path text not null default '',   -- host||page_path, joins report.conversation_page.page_path
    pageviews int  not null default 0,
    sessions  int  not null default 0,
    primary key (bot_id, day, full_path)
  )`)
await c.query('create index if not exists ga4_page_daily_bot_full on report.ga4_page_daily (bot_id, full_path)')
await c.query(`
  create table if not exists report.ga4_source_daily (
    bot_id        int  not null,
    day           date not null,
    source_medium text not null default '(unknown)',
    sessions      int  not null default 0,
    users         int  not null default 0,
    primary key (bot_id, day, source_medium)
  )`)
await c.query(`
  create table if not exists report.ga4_event_daily (
    bot_id      int  not null,
    day         date not null,
    event_name  text not null default '',
    event_count int  not null default 0,
    primary key (bot_id, day, event_name)
  )`)

// --- the headline view: real site traffic x the bot-side page funnel, per page. ---
// Full outer join so we see high-traffic pages the bot never engaged (opportunity)
// AND pages the bot handled that we can now weight by real traffic.
await c.query(`
  create or replace view report.ga4_page_opportunity as
  with ga as (
    select bot_id, full_path as page_path,
           sum(pageviews)::int pageviews, sum(sessions)::int sessions
    from report.ga4_page_daily
    group by 1, 2
  ),
  cp as (
    select bot_id, page_path,
           count(*)::int conversations,
           count(*) filter (where substantive)::int substantive,
           count(*) filter (where pinchpoint is not null and pinchpoint <> 'None')::int friction
    from report.conversation_page
    group by 1, 2
  )
  select coalesce(ga.bot_id, cp.bot_id)       as bot_id,
         coalesce(ga.page_path, cp.page_path)  as page_path,
         coalesce(ga.pageviews, 0)             as pageviews,
         coalesce(ga.sessions, 0)              as sessions,
         coalesce(cp.conversations, 0)         as conversations,
         coalesce(cp.substantive, 0)           as substantive,
         coalesce(cp.friction, 0)              as friction,
         case when ga.pageviews > 0
              then round(100.0 * coalesce(cp.conversations, 0) / ga.pageviews, 2)
         end                                   as bot_open_rate_pct
  from ga
  full join cp on ga.bot_id = cp.bot_id and ga.page_path = cp.page_path`)

await c.query('grant select on report.ga4_traffic_daily, report.ga4_page_daily, report.ga4_source_daily, report.ga4_event_daily, report.ga4_page_opportunity to anon')

// Date-aware page-opportunity join (the all-time view above can't respect the
// dashboard's window). Postgres does the heavy GA4-pages × bot-page-funnel join
// and returns the top pages by real traffic, with the bot's reach on each.
// SECURITY DEFINER so it can read conversation_page regardless of anon grants;
// returns only aggregates (URLs + counts), no PII — same exposure as the anon
// report.* matviews. Fully-qualified names + fixed search_path.
await c.query(`
  create or replace function report.ga4_page_opportunity(
    p_bot_id int, p_from date, p_to date, p_limit int default 20)
  returns table(page_path text, pageviews bigint, sessions bigint,
                conversations bigint, friction bigint, reach_pct numeric)
  language sql stable security definer set search_path = pg_catalog, report as $$
    with ga as (
      select full_path as page_path, sum(pageviews)::bigint pageviews, sum(sessions)::bigint sessions
      from report.ga4_page_daily
      where bot_id = p_bot_id and day between p_from and p_to
      group by 1
    ),
    cp as (
      select page_path, count(*)::bigint conversations,
             count(*) filter (where pinchpoint is not null and pinchpoint <> 'None')::bigint friction
      from report.conversation_page
      where bot_id = p_bot_id and day between p_from and p_to
      group by 1
    )
    select coalesce(ga.page_path, cp.page_path) as page_path,
           coalesce(ga.pageviews, 0) as pageviews,
           coalesce(ga.sessions, 0) as sessions,
           coalesce(cp.conversations, 0) as conversations,
           coalesce(cp.friction, 0) as friction,
           case when ga.sessions > 0
                then round(100.0 * coalesce(cp.conversations, 0) / ga.sessions, 2) end as reach_pct
    from ga full join cp on ga.page_path = cp.page_path
    order by coalesce(ga.pageviews, 0) desc, coalesce(cp.conversations, 0) desc
    limit least(greatest(p_limit, 1), 100)
  $$`)
await c.query('revoke all on function report.ga4_page_opportunity(int, date, date, int) from public')
await c.query('grant execute on function report.ga4_page_opportunity(int, date, date, int) to anon')

// --- seed the bot 2 (Mountain Collective) mapping for the first test. ---
// Stand-in property = GSB's own 475800896 (getskibots.com), the only property the
// service account can read today. Swap ga4_property_id to Mountain Collective's
// numeric Property ID once they grant the SA Viewer access.
await c.query(`
  insert into report.bot_ga4 (bot_id, ga4_property_id, label, status, note)
  values (2, '475800896', 'The Mountain Collective', 'connected',
          'TEST stand-in = GSB property 475800896 (getskibots.com). Swap to Mountain Collective''s numeric Property ID once they add shredintel-ga4-reader@shredintel-ga4.iam.gserviceaccount.com as a Viewer.')
  on conflict (bot_id) do update
    set ga4_property_id = excluded.ga4_property_id,
        label = excluded.label, status = excluded.status,
        note = excluded.note, updated_at = now()`)

const { rows } = await c.query('select bot_id, ga4_property_id, label, status from report.bot_ga4 order by bot_id')
console.log('report.bot_ga4:')
for (const r of rows) console.log(`  bot ${r.bot_id} -> property ${r.ga4_property_id}  [${r.status}]  ${r.label}`)
await c.end()
console.log('Done. Now run:  node ga4-sync.mjs --bot=2')
