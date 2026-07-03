#!/usr/bin/env node
/** inspect-base-views.mjs — read-only. The two base views that everything reads
 *  from: how bot_id is attributed, how sender_type is derived, what's filtered,
 *  and whether outcome normalization produces SOLVED. */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

for (const v of ['_chat_history_v', '_conversations_v']) {
  console.log(`\n===== report.${v} =====`)
  try {
    const { rows } = await c.query(`select pg_get_viewdef('report.${v}'::regclass, true) def`)
    console.log(rows[0].def)
  } catch (e) { console.log('  err:', e.message.split('\n')[0]) }
}

// find Jackson Hole bot_id
console.log('\n=== Jackson Hole bot lookup ===')
const { rows: jh } = await c.query(
  `select id, name, active from raw.admin_bot where name ilike '%jackson hole%' order by id`)
for (const r of jh) console.log(`  bot ${r.id}  active=${r.active}  ${r.name}`)

// outcome rollup for JH vs bot 2 (compare to export's ~75% SOLVED)
for (const botId of [jh[0]?.id, 2].filter(Boolean)) {
  console.log(`\n=== report.outcome_timeline rollup — bot ${botId} (all-time) ===`)
  try {
    const { rows: [r] } = await c.query(`
      select sum(total_conversations) total, sum(solved) solved, sum(unengaged) unengaged,
             sum(failed) failed, sum(engaged_conversations) engaged
        from report.outcome_timeline where bot_id=$1`, [botId])
    const pct = (n) => r.total > 0 ? `${(100 * n / r.total).toFixed(1)}%` : '—'
    console.log(`  total=${r.total}  solved=${r.solved} (${pct(r.solved)})  unengaged=${r.unengaged} (${pct(r.unengaged)})  failed=${r.failed} (${pct(r.failed)})  engaged=${r.engaged}`)
  } catch (e) { console.log('  err:', e.message.split('\n')[0]) }
}

// raw outcome vocabulary for JH's conversations (via user bridge) — does raw say SOLVED or something else?
if (jh[0]?.id) {
  console.log(`\n=== raw.admin_conversation.outcome for JH bot ${jh[0].id} (via user_id→admin_user.bot_id) ===`)
  try {
    const { rows } = await c.query(`
      select coalesce(cv.outcome,'(null)') outcome, count(*) c
        from raw.admin_conversation cv
        join raw.admin_user u on u.id = cv.user_id
       where u.bot_id = $1
       group by 1 order by 2 desc limit 12`, [jh[0].id])
    for (const r of rows) console.log(`   ${String(r.outcome).padEnd(16)} ${r.c}`)
  } catch (e) { console.log('  err:', e.message.split('\n')[0]) }
}

await c.end()
console.log('\ndone.')
