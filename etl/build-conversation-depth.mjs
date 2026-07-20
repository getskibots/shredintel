#!/usr/bin/env node
/**
 * build-conversation-depth.mjs — report.conversation_depth, the one new matview
 * powering §1 "Extended Conversation Counts" metrics not already in
 * sender_mix_stack / outcome_timeline:
 *   • single-user-message (bounce) sessions
 *   • avg user messages per engaged conversation
 *   • (denominators: conversations, engaged, user/total messages)
 *
 * PERF: references report._chat_history_v EXACTLY ONCE (a prior version scanned
 * it 3× and hit statement_timeout). Time-to-first-response is deferred to a
 * separate enrichment (needs per-conversation message ordering — the expensive
 * part); the columns exist here as NULL so the frontend shape stays stable.
 *
 * Grain: (bot_id, day) where day = conversation started_at::date — matches
 * outcome_timeline so counts line up. Refreshable; add to nightly droplet job.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(`set statement_timeout = '25min'`)

const t0 = Date.now()
console.log('Building report.conversation_depth (single-scan) …')

// Other matviews now read from conversation_depth (report.fleet_benchmarks,
// report.fleet_overview). A plain DROP fails against them, and DROP ... CASCADE
// would silently DESTROY them — the script rebuilding fleet_overview lives on a
// different branch, so cascading here would be unrecoverable. Detect dependents
// and stop with instructions rather than guessing.
//
// NOTE: this script re-creates the DEFINITION. If you only need fresh DATA,
// `refresh materialized view` is what you want and needs no drop at all — which
// is why the nightly (refresh.mjs) is unaffected by this.
const deps = await c.query(
  `select distinct dep.relname as name
     from pg_depend d
     join pg_rewrite r   on r.oid = d.objid
     join pg_class   dep on dep.oid = r.ev_class
     join pg_class   src on src.oid = d.refobjid
     join pg_namespace n on n.oid = src.relnamespace
    where n.nspname = 'report'
      and src.relname = $1
      and dep.relname <> $1
      and dep.relkind in ('m','v')
    order by 1`,
  ['conversation_depth'],
)

if (deps.rows.length) {
  const names = deps.rows.map((r) => `report.${r.name}`).join(', ')
  console.error(`\n✗ Cannot re-create report.conversation_depth — these depend on it:`)
  console.error(`    ${names}\n`)
  console.error(`  Only need fresh DATA? No drop required:`)
  console.error(`    refresh materialized view report.conversation_depth;\n`)
  console.error(`  Genuinely changing the DEFINITION? Then, in order:`)
  console.error(`    1. drop materialized view ${names};`)
  console.error(`    2. re-run this script`)
  console.error(`    3. rebuild them (build-fleet-benchmarks.mjs, build-fleet-overview.mjs)\n`)
  await c.end()
  process.exit(1)
}

await c.query(`drop materialized view if exists report.conversation_depth`)

await c.query(`
create materialized view report.conversation_depth as
with per_conv as (                              -- ONE scan of the base view
  select conversation_id,
         count(*) filter (where sender_type = 'user') as user_msgs,
         count(*)                                     as total_msgs
    from report._chat_history_v
   group by conversation_id
)
select
  cv.bot_id,
  cv.day,
  count(*)                                              as conversations,
  count(*) filter (where coalesce(pc.user_msgs,0) >= 1) as engaged_conversations,
  count(*) filter (where pc.user_msgs = 1)              as single_user_msg_sessions,
  sum(coalesce(pc.user_msgs,0))                         as user_messages,
  sum(coalesce(pc.total_msgs,0))                        as total_messages,
  avg(pc.user_msgs) filter (where pc.user_msgs >= 1)    as avg_user_msgs_per_engaged,
  null::double precision                                as avg_first_response_sec,
  null::double precision                                as median_first_response_sec
from report._conversations_v cv
left join per_conv pc on pc.conversation_id = cv.conversation_id
group by cv.bot_id, cv.day
`)

await c.query(`create unique index conversation_depth_pk on report.conversation_depth (bot_id, day)`)
await c.query(`grant select on report.conversation_depth to anon, authenticated`)

console.log(`  ✓ built + indexed + granted in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// sanity: JH chat (43) + Mountain Collective (2), last 30d
for (const botId of [43, 2]) {
  const { rows: [r] } = await c.query(`
    select
      sum(conversations)            conversations,
      sum(engaged_conversations)    engaged,
      sum(single_user_msg_sessions) single_user,
      sum(user_messages)            user_msgs,
      sum(total_messages)           total_msgs
    from report.conversation_depth
    where bot_id = $1 and day >= (current_date - 30)`, [botId])
  const bounce = r.engaged > 0 ? (100 * r.single_user / r.engaged).toFixed(1) + '%' : '—'
  const mps = r.conversations > 0 ? (r.total_msgs / r.conversations).toFixed(1) : '—'
  const umps = r.conversations > 0 ? (r.user_msgs / r.conversations).toFixed(1) : '—'
  console.log(`\n  bot ${botId} (30d): sessions=${r.conversations}  engaged=${r.engaged}`)
  console.log(`    single-user-msg (bounce of engaged) = ${r.single_user} (${bounce})`)
  console.log(`    total msgs=${r.total_msgs}  user msgs=${r.user_msgs}  msgs/session=${mps}  user-msgs/session=${umps}`)
}

// cross-check total_messages vs sender_mix_stack (same base, should match)
const { rows: [x] } = await c.query(`
  select
    (select sum(total_messages) from report.conversation_depth where bot_id=43 and day >= current_date-30) depth_msgs,
    (select sum(total_messages) from report.sender_mix_stack   where bot_id=43 and day >= current_date-30) sender_msgs`)
console.log(`\n  cross-check bot 43 total_messages: depth=${x.depth_msgs}  sender_mix=${x.sender_msgs}  ${String(x.depth_msgs) === String(x.sender_msgs) ? '✓ match' : '⚠ MISMATCH'}`)

await c.end()
console.log('\ndone.')
