/**
 * flip-local-dates.mjs — canonical UTC→resort-local date flip.
 * Rewrites the two base views to bucket day/dow/hour in each bot's local tz via a
 * hash JOIN to report.bot_timezone (fast), recomputes conversation_intel.day, and
 * refreshes matviews. Aborts if expected patterns aren't found. Reversible.
 */
import pg from 'pg'; import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const c = new pg.Client({ host: env.SUPABASE_DB_HOST, port:+env.SUPABASE_DB_PORT, user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, database: env.SUPABASE_DB_NAME, ssl:{rejectUnauthorized:false} })
await c.connect(); await c.query("set statement_timeout='550000ms'")
const SUBQ = /\(\s*SELECT bt\.tz\s+FROM report\.bot_timezone bt\s+WHERE bt\.bot_id = u\.bot_id\)/g
const JOINANCHOR = 'JOIN raw.admin_user u ON u.id = c.user_id'
const JOININJECT = JOINANCHOR + '\n     LEFT JOIN report.bot_timezone tzj ON tzj.bot_id = u.bot_id'
const localExpr = (ts) => `((${ts} AT TIME ZONE 'UTC'::text) AT TIME ZONE COALESCE(tzj.tz, 'America/Denver'::text))`

function fixView(name, def, expectSub) {
  const nSub = (def.match(SUBQ) || []).length
  if (nSub !== expectSub) throw new Error(`ABORT ${name}: expected ${expectSub} subqueries, found ${nSub}`)
  let out = def.replace(SUBQ, 'tzj.tz')
  if (!out.includes(JOINANCHOR)) throw new Error(`ABORT ${name}: admin_user join anchor not found`)
  out = out.replace(JOINANCHOR, JOININJECT)
  return out
}
for (const [v, expect] of [['_conversations_v', 1], ['_chat_history_v', 10]]) {
  const def = (await c.query(`select pg_get_viewdef(('report.'||$1)::regclass,true) d`,[v])).rows[0].d
  const fixed = fixView(v, def, expect)
  await c.query(`create or replace view report.${v} as ${fixed}`)
  console.log(`✓ report.${v} → hash-join tz (was ${expect} per-row subqueries)`) 
}
// conversation_intel.day already recomputed in the prior run; ensure it's local (idempotent)
const up = await c.query(`update report.conversation_intel ci
  set day = (cv.started_at at time zone 'UTC' at time zone coalesce((select tz from report.bot_timezone where bot_id=ci.bot_id),'America/Denver'))::date
  from raw.admin_conversation cv where cv.id = ci.conversation_id
    and ci.day <> (cv.started_at at time zone 'UTC' at time zone coalesce((select tz from report.bot_timezone where bot_id=ci.bot_id),'America/Denver'))::date`)
console.log(`✓ conversation_intel.day reconciled (${up.rowCount} rows changed)`) 
// refresh all report matviews (page before time)
const mvs = (await c.query(`select matviewname from pg_matviews where schemaname='report'`)).rows.map(r=>r.matviewname)
const order = [...mvs.filter(m=>!['conversation_time','conversation_page'].includes(m)), 'conversation_page', 'conversation_time'].filter(m=>mvs.includes(m))
for (const m of order) { const t=Date.now(); await c.query(`refresh materialized view report.${m}`); console.log(`  refreshed ${m} (${((Date.now()-t)/1000).toFixed(1)}s)`) }
await c.query(`notify pgrst, 'reload schema'`)
console.log('DONE.')
await c.end()
