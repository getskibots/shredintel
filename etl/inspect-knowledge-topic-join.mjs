#!/usr/bin/env node
/** inspect-knowledge-topic-join.mjs <botId> — READ-ONLY. Can we tie a knowledge
 *  reply to its conversation's TOPIC? Tests reply.user_id -> conversation key ->
 *  intel section. Determines whether per-topic source-mix is buildable. */
import 'dotenv/config'
import pg from 'pg'

const BOT = Number(process.argv[2] || 43)
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const rows = (sql) => c.query(sql).then((r) => r.rows)
const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)

// what key does the per-conversation intel spine carry?
for (const t of ['conversation_intel', 'conversation_time']) {
  const cs = await rows(`select column_name from information_schema.columns where table_schema='report' and table_name='${t}' order by ordinal_position`)
  console.log(`report.${t} cols: ${cs.map((r) => r.column_name).join(', ')}`)
}

// is user_id ~ 1 conversation? (distinct users vs replies vs conversations)
console.log('\n=== cardinality (bot ' + BOT + ') ===')
for (const r of await rows(`
  select
    (select count(*) from raw.admin_knowledge_reply x join raw.admin_user u on u.id=x.user_id where u.bot_id=${BOT}) replies,
    (select count(distinct x.user_id) from raw.admin_knowledge_reply x join raw.admin_user u on u.id=x.user_id where u.bot_id=${BOT}) distinct_reply_users,
    (select count(*) from report.conversation_intel where bot_id=${BOT}) intel_convos,
    (select count(*) from report.conversation_intel where bot_id=${BOT} and substantive) intel_substantive`))
  console.log(`  replies=${r.replies}  distinct_reply_users=${r.distinct_reply_users}  intel_convos=${r.intel_convos}  substantive=${r.intel_substantive}`)

// does conversation_intel carry user_id (or conversation_id that maps to admin_user)?
const ic = (await rows(`select column_name from information_schema.columns where table_schema='report' and table_name='conversation_intel'`)).map((r) => r.column_name)
const key = ['user_id', 'conversation_id', 'admin_user_id'].find((k) => ic.includes(k))
console.log(`\nconversation_intel join key candidate: ${key}`)

// TEST THE JOIN: replies -> conversation_intel via user_id, bucketed by section (topic)
if (ic.includes('user_id')) {
  console.log('\n=== JOIN TEST: reply.user_id = conversation_intel.user_id ===')
  const [cov] = await rows(`
    select count(*) replies,
           count(ci.section) matched,
           round(100.0*count(ci.section)/greatest(1,count(*)),1) pct
      from raw.admin_knowledge_reply x
      join raw.admin_user u on u.id=x.user_id and u.bot_id=${BOT}
      left join report.conversation_intel ci on ci.user_id = x.user_id and ci.substantive
  `)
  console.log(`  replies=${cov.replies}  matched_to_topic=${cov.matched}  (${cov.pct}%)`)

  console.log('\n=== source_type × topic (sample) — the per-topic mix, if join holds ===')
  for (const r of await rows(`
    select ci.section topic, coalesce(x.source_type,'(model/none)') src, count(*) n
      from raw.admin_knowledge_reply x
      join raw.admin_user u on u.id=x.user_id and u.bot_id=${BOT}
      join report.conversation_intel ci on ci.user_id = x.user_id and ci.substantive
     group by 1,2 order by 1, 3 desc limit 24`))
    console.log(`  ${pad(r.topic, 24)} ${pad(r.src, 14)} ${r.n}`)
} else {
  console.log('\n(no user_id on conversation_intel — need a conversation<->user bridge; checking conversation_time)')
  const ct = (await rows(`select column_name from information_schema.columns where table_schema='report' and table_name='conversation_time'`)).map((r) => r.column_name)
  console.log('  conversation_time has user_id? ', ct.includes('user_id'))
}

await c.end()
console.log('\ndone.')
