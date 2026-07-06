#!/usr/bin/env node
/**
 * inspect-knowledge-sources.mjs <botId> — READ-ONLY recon of the knowledge
 * SOURCE taxonomy. Question: can we bucket every bot answer into
 * prompt / website / AI-edit / file / flow-action / none?
 * Profiles raw.admin_knowledge_reply (+ api_call_history for actions, + any
 * edit/override tables). Aggregates only — no third-party calls.
 */
import 'dotenv/config'
import pg from 'pg'

const BOT = Number(process.argv[2] || 43)
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const rows = (sql, p) => c.query(sql, p).then((r) => r.rows)
const colsOf = async (t) =>
  (await rows(`select column_name, data_type from information_schema.columns where table_schema='raw' and table_name=$1 order by ordinal_position`, [t]))
async function scope(t) {
  const cs = (await colsOf(t)).map((x) => x.column_name)
  if (cs.includes('bot_id')) return { cs, from: `raw.${t} x`, where: `x.bot_id=${BOT}` }
  if (cs.includes('user_id')) return { cs, from: `raw.${t} x join raw.admin_user u on u.id=x.user_id`, where: `u.bot_id=${BOT}` }
  return { cs, from: `raw.${t} x`, where: 'true' }
}
const pad = (v, n) => String(v).slice(0, n).padEnd(n)

console.log(`\n############ knowledge-source recon · bot ${BOT} ############`)

// 1. full column list of admin_knowledge_reply
console.log('\n=== raw.admin_knowledge_reply columns ===')
for (const col of await colsOf('admin_knowledge_reply')) console.log(`  ${pad(col.column_name, 28)} ${col.data_type}`)

const kr = await scope('admin_knowledge_reply')
const typeCol = ['source_type', 'reply_type', 'answer_type', 'source_kind', 'kind', 'type'].find((x) => kr.cs.includes(x))
const valCol = ['source_value', 'source_name', 'source', 'reference', 'source_id'].find((x) => kr.cs.includes(x))
const failCol = ['is_failed', 'failed', 'is_fallback', 'fallback'].find((x) => kr.cs.includes(x))

// 2. overall gap
if (failCol) {
  const [f] = await rows(`select count(*) filter(where x."${failCol}") fails, count(*) tot from ${kr.from} where ${kr.where}`)
  console.log(`\n=== gap (via ${failCol}) === ${f.fails}/${f.tot} failed = ${(100 * f.fails / Math.max(1, f.tot)).toFixed(1)}%`)
}

// 3. source_type distribution — THE taxonomy question
console.log(`\n=== source_type distribution (typeCol=${typeCol}) ===`)
if (typeCol) {
  for (const r of await rows(`select coalesce(x."${typeCol}"::text,'(null)') t, count(*) n${failCol ? `, count(*) filter(where x."${failCol}") failed` : ''} from ${kr.from} where ${kr.where} group by 1 order by 2 desc`))
    console.log(`  ${pad(r.t, 22)} ${String(r.n).padStart(9)}${failCol ? `   failed=${r.failed}` : ''}`)
} else {
  console.log('  (no source_type-like column found)')
}

// 4. source_value samples per type (confirm FILE=file, WEBSITE=url, etc.)
if (typeCol && valCol) {
  console.log(`\n=== ${valCol} samples per ${typeCol} ===`)
  for (const t of await rows(`select distinct x."${typeCol}"::text t from ${kr.from} where ${kr.where} and x."${typeCol}" is not null`)) {
    console.log(`  [${t.t}]`)
    for (const e of await rows(`select coalesce(nullif(left(x."${valCol}"::text,58),''),'(empty)') v, count(*) n from ${kr.from} where ${kr.where} and x."${typeCol}"::text=$1 group by 1 order by 2 desc limit 3`, [t.t]))
      console.log(`     ${pad(e.v, 60)} ${e.n}`)
  }
}

// 5. edit/override/LLM-ish signal columns already in the reply row?
console.log('\n=== signal-ish columns in admin_knowledge_reply ===')
console.log('  ', kr.cs.filter((n) => /edit|override|manual|curat|human|correct|approved|generat|gpt|llm|openai|odin|fallback|confidence|prompt/i.test(n)).join(', ') || '(none matched)')

// 6. other candidate raw tables for AI-edits / flows / actions
console.log('\n=== candidate raw tables (edit|override|action|flow|api_call|generat|openai|answer) ===')
for (const t of await rows(`select table_name, (select count(*) from information_schema.columns col where col.table_schema='raw' and col.table_name=t.table_name) cols from information_schema.tables t where table_schema='raw' and table_name ~* 'edit|override|action|flow|api_call|generat|openai|gpt|answer|kb_|knowledge' order by 1`))
  console.log(`  raw.${pad(t.table_name, 34)} (${t.cols} cols)`)

// 7. admin_api_call_history — the flows + AI actions signal
try {
  const api = await scope('admin_api_call_history')
  console.log(`\n=== raw.admin_api_call_history (flows/AI actions) ===\n  cols: ${api.cs.join(', ')}`)
  const [n] = await rows(`select count(*) n from ${api.from} where ${api.where}`)
  console.log(`  rows for bot ${BOT}: ${n.n}`)
  const nameCol = ['name', 'action_name', 'endpoint', 'api_name', 'title', 'url', 'method'].find((x) => api.cs.includes(x))
  if (nameCol && Number(n.n) > 0) {
    console.log(`  top ${nameCol}:`)
    for (const r of await rows(`select coalesce(nullif(left(x."${nameCol}"::text,46),''),'(empty)') v, count(*) n from ${api.from} where ${api.where} group by 1 order by 2 desc limit 10`))
      console.log(`     ${pad(r.v, 48)} ${r.n}`)
  }
} catch (e) { console.log('  api_call_history err:', e.message.split('\n')[0]) }

await c.end()
console.log('\ndone.')
