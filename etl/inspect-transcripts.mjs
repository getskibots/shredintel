#!/usr/bin/env node
/**
 * inspect-transcripts.mjs — read-only recon for the enrichment pilot.
 * Learn how message text is stored so we can reconstruct per-conversation
 * transcripts to feed the classifier. PII-safe: displays only BOT-sent text
 * samples; guest rows shown as lengths + sender sequence, never content.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const BOT = 43

// 1) what type is the message jsonb?
console.log('=== message jsonb_typeof (bot 43, last 90d) ===')
const { rows: types } = await c.query(`
  select jsonb_typeof(h.message) t, count(*) c
    from raw.admin_chat_history h
    join report._conversations_v cv on cv.conversation_id = h.conversation_id
   where cv.bot_id = $1 and h."timestamp" >= now() - interval '90 days'
   group by 1 order by 2 desc`, [BOT])
for (const r of types) console.log(`  ${r.t ?? 'NULL'}: ${r.c}`)

// 2) extraction candidates on a few BOT rows (bot text = safe to show)
console.log('\n=== BOT-sent text samples — extraction candidates ===')
const { rows: samples } = await c.query(`
  select
    left(h.message::text, 140)              as as_text,
    left(h.message #>> '{}', 140)           as scalar_text,
    left(h.formatted_chat_history::text,140) as fmt
    from raw.admin_chat_history h
    join report._conversations_v cv on cv.conversation_id = h.conversation_id
   where cv.bot_id = $1 and coalesce(h.is_echo,false) = true
     and coalesce(h.is_from_support,0) = 0 and h.is_message = 1
     and h.message is not null
   order by h."timestamp" desc limit 4`, [BOT])
samples.forEach((r, i) => {
  console.log(`  [${i}] message::text     = ${JSON.stringify(r.as_text)}`)
  console.log(`      message#>>'{}'     = ${JSON.stringify(r.scalar_text)}`)
  console.log(`      formatted_chat_hist= ${JSON.stringify(r.fmt)}`)
})

// 3) sample conversations — FULL transcripts (Brandon authorized full display)
console.log('\n=== sample conversations — full transcripts ===')
const { rows: picks } = await c.query(`
  select conversation_id, count(*) n
    from report._chat_history_v where bot_id=$1
   group by 1 having count(*) between 6 and 14 order by random() limit 3`, [BOT])
for (const p of picks) {
  const { rows: msgs } = await c.query(`
    select case when coalesce(h.is_from_support,0)=1 then 'SUPPORT'
                when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
           coalesce(nullif(h.message #>> '{}',''), h.message::text, '') txt
      from raw.admin_chat_history h
     where h.conversation_id = $1 and h.is_message = 1 and coalesce(h.visible,1) = 1
     order by h."timestamp"`, [p.conversation_id])
  console.log(`\n  ── conversation ${p.conversation_id} (${p.n} msgs) ──`)
  for (const m of msgs) {
    const t = (m.txt || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    console.log(`    ${m.sender}: ${t}`)
  }
}

// 4) per-conversation message-count distribution (bot 43) — for token sizing
console.log('\n=== per-conversation message counts (bot 43, all-time) ===')
const { rows: [dist] } = await c.query(`
  with pc as (
    select conversation_id, count(*) n from report._chat_history_v where bot_id=$1 group by 1
  )
  select count(*) conversations,
         round(avg(n),1) avg_msgs,
         percentile_cont(0.5) within group (order by n) p50,
         percentile_cont(0.9) within group (order by n) p90,
         max(n) max_msgs
    from pc`, [BOT])
console.log('  ', JSON.stringify(dist))

// 5) engaged (>=1 user msg) conversation count — the realistic enrichment universe
const { rows: [eng] } = await c.query(`
  select count(*) total_convs,
         count(*) filter (where engaged) engaged_convs
    from (
      select conversation_id, bool_or(sender_type='user') engaged
        from report._chat_history_v where bot_id=$1 group by 1
    ) t`, [BOT])
console.log('  bot 43:', JSON.stringify(eng), '(engaged = has >=1 user msg — enrichment candidates)')

await c.end()
console.log('\ndone.')
