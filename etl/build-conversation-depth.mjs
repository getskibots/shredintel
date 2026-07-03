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
