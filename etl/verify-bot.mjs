#!/usr/bin/env node
/**
 * verify-bot.mjs <botId> — read-only. Shows what the dashboard's live source
 * (report.*) actually returns for a bot, vs raw ground truth, so we can tell
 * live-vs-fixture and spot metric-mapping bugs. Usage: node verify-bot.mjs 248
 */
import 'dotenv/config'
import pg from 'pg'

const BOT = process.argv[2] || '248'
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log(`\n=== bot ${BOT} — report.* (what the dashboard reads) ===\n`)

const NUM = ['integer', 'bigint', 'numeric', 'double precision', 'real', 'smallint']
for (const v of ['outcome_timeline', 'conversion_pulse', 'sender_mix_stack', 'knowledge_source_leaderboard']) {
  try {
    const { rows: cols } = await c.query(
      `select column_name n, data_type d from information_schema.columns
        where table_schema='report' and table_name=$1 order by ordinal_position`, [v])
    if (cols.length === 0) { console.log(`report.${v}: (not found)`); continue }
    const hasBot = cols.some((x) => x.n === 'bot_id')
    const nums = cols.filter((x) => NUM.includes(x.d) && x.n !== 'bot_id').map((x) => x.n)
    const sumExpr = nums.map((n) => `sum("${n}")::numeric as "${n}"`).join(', ')
    const where = hasBot ? `where bot_id = ${Number(BOT)}` : ''
    const { rows: [agg] } = await c.query(`select count(*) as _rows, ${sumExpr} from report.${v} ${where}`)
    console.log(`report.${v}  (${agg._rows} rows):`)
    for (const n of nums) console.log(`    ${n.padEnd(30)} ${agg[n]}`)
    console.log('')
  } catch (e) { console.log(`report.${v}: ERR ${e.message.split('\n')[0]}\n`) }
}

// raw ground truth: conversation outcomes for this bot
console.log(`=== bot ${BOT} — raw ground truth ===\n`)
try {
  const { rows: convCols } = await c.query(
    `select column_name from information_schema.columns where table_schema='raw' and table_name='admin_conversation'`)
  const names = convCols.map((r) => r.column_name)
  const hasBot = names.includes('bot_id')
  const outcomeCol = ['outcome', 'status', 'result'].find((x) => names.includes(x))
  if (hasBot && outcomeCol) {
    const { rows } = await c.query(
      `select "${outcomeCol}" as outcome, count(*) c from raw.admin_conversation where bot_id=${Number(BOT)} group by 1 order by 2 desc`)
    console.log('admin_conversation outcomes (bot has bot_id col):')
    for (const r of rows) console.log(`    ${String(r.outcome).padEnd(16)} ${r.c}`)
  } else if (outcomeCol) {
    const { rows } = await c.query(
      `select cv."${outcomeCol}" as outcome, count(*) c
         from raw.admin_conversation cv join raw.admin_user u on u.id = cv.user_id
        where u.bot_id=${Number(BOT)} group by 1 order by 2 desc`)
    console.log(`admin_conversation outcomes (joined via admin_user.bot_id; outcome col='${outcomeCol}'):`)
    for (const r of rows) console.log(`    ${String(r.outcome).padEnd(16)} ${r.c}`)
  } else {
    console.log('admin_conversation columns:', names.join(', '))
  }
} catch (e) { console.log('raw outcome check ERR:', e.message.split('\n')[0]) }

await c.end()
