#!/usr/bin/env node
/**
 * detect-vertical.mjs — AUTO-DETECT each bot's vertical (ski / pass / golf / hotel /
 * water park / …) from its NAME + a sample of real customer questions, so enrichment
 * self-selects the right section preset. Replaces the hand-maintained BOT_VERTICAL map.
 *
 * One gpt-4o-mini call per bot (~$0.0003/bot). Writes report.bot_vertical
 * (bot_id → vertical, confidence, reason). Resumable (skips already-detected; NEVER
 * overwrites source='override' — your manual escape hatch). Low-confidence bots fall
 * back to the `generic` preset via the confidence gate at read time (see verticals.mjs).
 *
 *   node detect-vertical.mjs               # detect all not-yet-done bots
 *   node detect-vertical.mjs --redetect    # re-detect everything (keeps overrides)
 *   node detect-vertical.mjs 2 103 43      # just these bot ids
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
import { VERTICALS } from './verticals.mjs'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }
const REDETECT = process.argv.includes('--redetect')
const ONLY = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const CONC = 6

const pool = new pg.Pool({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false }, max: CONC + 1,
})

await pool.query(`create table if not exists report.bot_vertical (
  bot_id bigint primary key, vertical text not null, confidence real, reason text,
  also text[], source text not null default 'auto', detected_at timestamptz not null default now())`)
await pool.query('alter table report.bot_vertical add column if not exists also text[]').catch(() => {})
await pool.query('grant select on report.bot_vertical to anon, authenticated').catch(() => {})

const KEYS = Object.keys(VERTICALS).filter((k) => k !== 'generic')
const OPTIONS = KEYS.map((k) => `${k} = ${VERTICALS[k].desc}`).join('\n') + '\nother = none of the above fit'
const SYS = `You classify a tourism / leisure / travel business into a PRIMARY vertical for analytics, from its NAME and ACTUAL customer questions. Choose exactly one primary key:\n${OPTIONS}\nAlso return "secondary": an array of ADDITIONAL vertical keys ONLY when the business clearly operates a distinct second facility (e.g. a ski resort that ALSO runs a large water park). Usually []. Do NOT add a secondary for a minor amenity the primary already covers. Prefer the most specific primary; only use "other" if truly none apply.\nReturn strict JSON: {"vertical":"<primary key>","secondary":["<key>",...],"confidence":0..1,"reason":"<=8 words"}`

async function classify(name, msgs) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYS }, { role: 'user', content: `Business name: "${name}"\nSample customer questions:\n${msgs.map((m) => '- ' + m).join('\n')}` }] }),
    })
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 800 * (i + 1))); continue }
    const j = await r.json()
    return JSON.parse(j.choices[0].message.content)
  }
  throw new Error('429 after retries')
}

const RAWQ = `select coalesce(nullif(h.formatted_chat_history->>'text',''), nullif(h.message->>'text',''),
    nullif(h.message->>'content',''), nullif(h.formatted_chat_history->>'content',''), h.message #>> '{}') txt
  from raw.admin_chat_history h
  join raw.admin_conversation cv on cv.id = h.conversation_id
  join raw.admin_user u on u.id = cv.user_id
  where u.bot_id = $1 and coalesce(h.is_from_support,0)=0 and coalesce(h.is_message,1)=1
    and coalesce(h.visible,1)=1 and coalesce(h.is_echo,false)=false limit 25`

const { rows: bots } = await pool.query(
  `select b.id bot_id, b.name from public.bots b where b.name is not null ${ONLY.length ? 'and b.id = any($1)' : ''} order by b.id`,
  ONLY.length ? [ONLY] : [])
const already = new Set((await pool.query('select bot_id from report.bot_vertical')).rows.map((r) => Number(r.bot_id)))
const work = (REDETECT || ONLY.length) ? bots : bots.filter((b) => !already.has(Number(b.bot_id)))
console.log(`${work.length} bots to detect (of ${bots.length} named bots)…`)

let idx = 0, n = 0
async function worker() {
  while (idx < work.length) {
    const b = work[idx++]
    try {
      const cl = await pool.connect()
      let msgs = []
      try {
        await cl.query("set statement_timeout='25000ms'")
        // enriched bots → clean topics (fast); else raw guest messages
        msgs = (await cl.query(`select topic from report.conversation_intel where bot_id=$1 and substantive and topic is not null and topic<>'' limit 20`, [b.bot_id])).rows.map((r) => r.topic)
        if (msgs.length < 5) msgs = (await cl.query(RAWQ, [b.bot_id])).rows.map((r) => (r.txt || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20)
      } finally { cl.release() }

      let vert = 'generic', conf = 0.3, reason = 'too few messages to classify', also = null
      if (msgs.length >= 2) {
        const d = await classify(b.name, msgs)
        vert = VERTICALS[d.vertical] ? d.vertical : 'generic'
        conf = typeof d.confidence === 'number' ? d.confidence : null
        reason = String(d.reason || '').slice(0, 120)
        const sec = Array.isArray(d.secondary) ? [...new Set(d.secondary)].filter((k) => VERTICALS[k] && k !== vert && k !== 'generic').slice(0, 3) : []
        also = sec.length ? sec : null
      }
      await pool.query(`insert into report.bot_vertical (bot_id, vertical, confidence, reason, also, source)
        values ($1,$2,$3,$4,$5,'auto')
        on conflict (bot_id) do update set vertical=excluded.vertical, confidence=excluded.confidence,
          reason=excluded.reason, also=excluded.also, detected_at=now() where report.bot_vertical.source <> 'override'`,
        [b.bot_id, vert, conf, reason, also])
      n++
      if (n % 25 === 0) console.log(`  ${n}/${work.length}…`)
    } catch (e) { console.log(`  bot ${b.bot_id} (${(b.name || '').slice(0, 22)}) → ERR ${e.message.slice(0, 45)}`) }
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`✓ detected ${n} bots`)

console.log('\n=== FLEET VERTICAL BREAKDOWN ===')
for (const r of (await pool.query(`select vertical, count(*)::int bots, round(avg(confidence)::numeric,2) avg_conf from report.bot_vertical group by vertical order by bots desc`)).rows)
  console.log(`  ${String(r.bots).padStart(4)}  ${r.vertical.padEnd(16)}  avg conf ${r.avg_conf}`)
const low = (await pool.query(`select bot_id, vertical, confidence, reason from report.bot_vertical where confidence < 0.6 order by confidence limit 15`)).rows
console.log(`\nlow-confidence (<0.6, use generic / review) — ${low.length} shown:`)
for (const r of low) console.log(`  bot ${r.bot_id}: ${r.vertical} (${r.confidence}) — ${r.reason}`)
await pool.end()
