#!/usr/bin/env node
/** inspect-section1b.mjs — confirm bot bridge + message-vs-event semantics. Read-only, PII-safe (counts only). */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1) does admin_user carry bot_id? show link cols
const { rows: uc } = await c.query(
  `select column_name, data_type from information_schema.columns
     where table_schema='raw' and table_name='admin_user'
       and (column_name ~* 'bot|^id$|user') order by ordinal_position`)
console.log('=== admin_user link cols ===')
for (const r of uc) console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}`)

// 2) is_message vs is_echo vs postback — what is is_message=0?
console.log('\n=== is_message × is_echo × has_postback (60d) ===')
const { rows: mx } = await c.query(
  `select is_message, is_echo, (postback is not null and postback <> '') has_postback, count(*) c
     from raw.admin_chat_history where timestamp >= now() - interval '60 days'
     group by 1,2,3 order by 4 desc limit 16`)
for (const r of mx) console.log(`  is_message=${r.is_message}  is_echo=${r.is_echo}  postback=${r.has_postback}  →  ${r.c}`)

// 3) visible distribution
console.log('\n=== visible (60d) ===')
const { rows: vis } = await c.query(
  `select visible, count(*) c from raw.admin_chat_history where timestamp >= now() - interval '60 days' group by 1 order by 2 desc`)
for (const r of vis) console.log(`  visible=${r.visible}  →  ${r.c}`)

// 4) per-bot bridge sanity — bot 2 (Mountain Collective), 30d
console.log('\n=== bot-2 bridge sanity (30d, via user_id → admin_user.bot_id) ===')
try {
  const { rows: [b] } = await c.query(`
    select
      count(*) filter (where ch.is_message = 1) msgs,
      count(*) filter (where ch.is_echo = false and ch.is_message = 1) user_msgs,
      count(*) filter (where ch.is_echo = true  and ch.is_from_support = 0 and ch.is_message = 1) bot_msgs,
      count(*) filter (where ch.is_echo = true  and ch.is_from_support = 1) agent_msgs,
      count(distinct ch.conversation_id) sessions,
      count(distinct ch.user_id) users
    from raw.admin_chat_history ch
    join raw.admin_user u on u.id = ch.user_id
    where u.bot_id = 2 and ch.timestamp >= now() - interval '30 days'`)
  console.log('  ', JSON.stringify(b))
} catch (e) { console.log('  bridge err:', e.message.split('\n')[0]) }

// 5) conversation.outcome distribution (session-level)
console.log('\n=== admin_conversation.outcome (all) ===')
const { rows: oc } = await c.query(
  `select coalesce(outcome,'(null)') outcome, count(*) c from raw.admin_conversation group by 1 order by 2 desc limit 12`)
for (const r of oc) console.log(`  ${String(r.outcome).padEnd(24)} ${r.c}`)

await c.end()
console.log('\ndone.')
