#!/usr/bin/env node
/**
 * build-bot-timezone.mjs — the per-resort timezone table + a data-driven verifier.
 *
 * The mirror stores every timestamp in UTC, but each resort lives in its own
 * timezone (Eastern → Pacific, Canada, Arizona no-DST, even Chile). Bucketing
 * dates in UTC misfiles ~1 in 4 conversations onto the wrong resort-calendar day
 * (evening-local chats spill into the next UTC day). report.bot_timezone maps each
 * bot to its IANA zone so the report layer can compute resort-LOCAL dates + times.
 *
 * VERIFIER: converts each bot's activity into its assigned local time and checks
 * the overnight trough lands ~1-5am local. A mismatch = probable wrong tz (or a
 * voice/low-volume bot whose curve doesn't follow web-chat patterns).
 *
 * This table has NO live impact on its own — nothing reads it yet. It's the
 * prerequisite for the resort-local date re-base (conversation_time, additive).
 * Idempotent. Add new resorts to TZ below (source: 'mapped' = known location,
 * 'review' = uncertain, verify the trough).
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='280000ms'")

// bot_id -> [IANA tz, source]. 'mapped' = confident from resort location.
const TZ = {
  90: ['America/New_York', 'mapped'], 103: ['America/New_York', 'mapped'], 43: ['America/Denver', 'mapped'],
  16: ['America/New_York', 'mapped'], 2: ['America/Denver', 'review'], 277: ['America/New_York', 'review'],
  23: ['America/Denver', 'mapped'], 17: ['America/Los_Angeles', 'mapped'], 248: ['America/Denver', 'review'],
  190: ['America/New_York', 'mapped'], 152: ['America/Santiago', 'mapped'], 142: ['America/Edmonton', 'mapped'],
  171: ['America/Los_Angeles', 'mapped'], 60: ['America/New_York', 'review'], 200: ['America/New_York', 'mapped'],
  137: ['America/Denver', 'mapped'], 228: ['America/New_York', 'mapped'], 263: ['America/Toronto', 'mapped'],
  275: ['America/New_York', 'mapped'], 136: ['America/Boise', 'mapped'], 189: ['America/New_York', 'mapped'],
  101: ['America/New_York', 'mapped'], 166: ['America/New_York', 'mapped'], 254: ['America/Denver', 'mapped'],
  65: ['America/Denver', 'mapped'], 359: ['America/Phoenix', 'mapped'], 69: ['America/New_York', 'mapped'],
  364: ['America/Denver', 'review'], 252: ['America/Denver', 'mapped'], 76: ['America/New_York', 'mapped'],
  55: ['America/Denver', 'mapped'], 258: ['America/Denver', 'review'], 1: ['America/Denver', 'review'],
  143: ['America/Denver', 'mapped'],
}
// Default zone for any bot not listed (US Mountain). The report-local logic
// coalesces to this; run the verifier when a resort gets real volume.
const DEFAULT_TZ = 'America/Denver'

await c.query(`create table if not exists report.bot_timezone (
  bot_id integer primary key,
  tz text not null,
  source text not null default 'mapped',
  updated_at timestamptz not null default now()
)`)
const vals = Object.entries(TZ).map(([b, [tz, src]]) => `(${b},'${tz}','${src}')`).join(',')
await c.query(`insert into report.bot_timezone (bot_id, tz, source) values ${vals}
  on conflict (bot_id) do update set tz = excluded.tz, source = excluded.source, updated_at = now()`)
console.log(`✓ report.bot_timezone seeded (${Object.keys(TZ).length} bots; default ${DEFAULT_TZ} for the rest)`)

// ── verifier ───────────────────────────────────────────────────────────────
await c.query(`create temp table cvb as
  select u.bot_id, cv.started_at from raw.admin_conversation cv
  join raw.admin_user u on u.id = cv.user_id where cv.started_at is not null`)
await c.query('create index on cvb (bot_id)')
const { rows } = await c.query(`
  with lt as (
    select cvb.bot_id, extract(hour from (cvb.started_at at time zone 'UTC' at time zone bt.tz))::int lhr
    from cvb join report.bot_timezone bt on bt.bot_id = cvb.bot_id),
  h as (select bot_id, lhr, count(*) n from lt group by bot_id, lhr),
  ranked as (select bot_id, lhr, n,
    row_number() over (partition by bot_id order by n asc) lo,
    sum(n) over (partition by bot_id) tot from h)
  select r.bot_id, bt.tz, bt.source, coalesce(b.name, '?') name,
    max(tot) convs, max(lhr) filter (where lo = 1) trough_local
  from ranked r join report.bot_timezone bt on bt.bot_id = r.bot_id
  left join public.bots b on b.id = r.bot_id
  group by r.bot_id, bt.tz, bt.source, b.name order by max(tot) desc`)
console.log('\nbot  trough  verdict    tz (source)                   name')
let suspect = 0
for (const x of rows) {
  const ok = x.trough_local >= 0 && x.trough_local <= 5
  if (!ok) suspect++
  console.log(`${String(x.bot_id).padStart(4)}  ${String(x.trough_local + ':00').padStart(5)}   ${ok ? 'OK     ' : '⚠SUSPECT'}  ${(x.tz + ' (' + x.source + ')').padEnd(28)} ${x.name}`)
}
console.log(`\n${suspect} suspect / ${rows.length} bots (suspects are usually voice lines or low-volume — verify the zone by resort location).`)
await c.end()
