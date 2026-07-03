#!/usr/bin/env node
/**
 * explore-intent.mjs <botId> — read-only. Understand the intent/knowledge data
 * so we can design report.intent: nlp_request (classified intent + confidence)
 * and knowledge_reply (topics answered + is_failed gaps). Usage: node explore-intent.mjs 43
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

async function cols(t) {
  const { rows } = await c.query(
    `select column_name from information_schema.columns where table_schema='raw' and table_name=$1 order by ordinal_position`, [t])
  return rows.map((r) => r.column_name)
}
// how to scope a table to a bot: direct bot_id, else join admin_user
async function botScope(t) {
  const cs = await cols(t)
  if (cs.includes('bot_id')) return { cols: cs, from: `raw.${t} x`, where: `x.bot_id = ${BOT}` }
  if (cs.includes('user_id')) return { cols: cs, from: `raw.${t} x join raw.admin_user u on u.id = x.user_id`, where: `u.bot_id = ${BOT}` }
  return { cols: cs, from: `raw.${t} x`, where: 'true' }
}

console.log(`\n=== bot ${BOT} intent exploration ===`)

// ---- admin_nlp_request ----
const nlp = await botScope('admin_nlp_request')
console.log(`\nadmin_nlp_request cols: ${nlp.cols.join(', ')}`)
try {
  const { rows: [{ n }] } = await c.query(`select count(*) n from ${nlp.from} where ${nlp.where}`)
  console.log(`rows for bot: ${n}`)
  const intentCol = ['triggered_intent_id', 'intent', 'triggered_intent', 'intent_name'].find((x) => nlp.cols.includes(x))
  const confCol = ['detection_confidence', 'confidence'].find((x) => nlp.cols.includes(x))
  const sayCol = ['user_say', 'user_phrase', 'text'].find((x) => nlp.cols.includes(x))
  if (intentCol) {
    const { rows } = await c.query(`select x."${intentCol}"::text v, count(*) c from ${nlp.from} where ${nlp.where} group by 1 order by 2 desc limit 12`)
    console.log(`top ${intentCol}:`); for (const r of rows) console.log(`   ${String(r.v).slice(0,40).padEnd(42)} ${r.c}`)
  }
  if (confCol) {
    const { rows: [d] } = await c.query(`select round(avg(x."${confCol}")::numeric,3) avg, round(min(x."${confCol}")::numeric,3) lo, round(max(x."${confCol}")::numeric,3) hi from ${nlp.from} where ${nlp.where}`)
    console.log(`confidence: avg ${d.avg}  range ${d.lo}–${d.hi}`)
  }
  if (sayCol) {
    const { rows } = await c.query(`select left(x."${sayCol}",70) s from ${nlp.from} where ${nlp.where} and x."${sayCol}" is not null order by x.id desc limit 6`)
    console.log(`recent ${sayCol} samples:`); for (const r of rows) console.log(`   "${r.s}"`)
  }
} catch (e) { console.log('nlp err:', e.message.split('\n')[0]) }

// ---- admin_knowledge_reply ----
const kr = await botScope('admin_knowledge_reply')
console.log(`\nadmin_knowledge_reply cols: ${kr.cols.join(', ')}`)
try {
  const { rows: [{ n }] } = await c.query(`select count(*) n from ${kr.from} where ${kr.where}`)
  console.log(`rows for bot: ${n}`)
  if (kr.cols.includes('is_failed')) {
    const { rows: [f] } = await c.query(`select count(*) filter (where x.is_failed) fails, count(*) tot from ${kr.from} where ${kr.where}`)
    console.log(`knowledge gap: ${f.fails} failed / ${f.tot} (${(100*f.fails/Math.max(1,f.tot)).toFixed(1)}%)`)
  }
  const srcCol = ['source_name', 'source_value', 'source_type'].find((x) => kr.cols.includes(x))
  if (srcCol) {
    const { rows } = await c.query(`select coalesce(nullif(trim(x."${srcCol}"),''),'(none)') v, count(*) c from ${kr.from} where ${kr.where} group by 1 order by 2 desc limit 12`)
    console.log(`top ${srcCol}:`); for (const r of rows) console.log(`   ${String(r.v).slice(0,44).padEnd(46)} ${r.c}`)
  }
  const phraseCol = ['user_phrase', 'contextualized_user_phrase'].find((x) => kr.cols.includes(x))
  if (phraseCol && kr.cols.includes('is_failed')) {
    const { rows } = await c.query(`select left(x."${phraseCol}",70) s from ${kr.from} where ${kr.where} and x.is_failed and x."${phraseCol}" is not null order by x.id desc limit 6`)
    console.log(`recent FAILED ${phraseCol} (the gaps):`); for (const r of rows) console.log(`   "${r.s}"`)
  }
} catch (e) { console.log('kr err:', e.message.split('\n')[0]) }

await c.end()
