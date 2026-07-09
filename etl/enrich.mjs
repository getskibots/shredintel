#!/usr/bin/env node
/**
 * enrich.mjs — combined, VERTICAL-AWARE ShredIntel enrichment (single pass).
 *
 * One gpt-4o-mini call per conversation produces the FULL intel row the dashboard
 * reads — no more 2-pass pipeline:
 *   substantive, category (universal 12-bucket spine → cross-partner comparability),
 *   section  (per-VERTICAL knowledge taxonomy → the §2 "what guests ask about" panel),
 *   pinchpoint (universal ecommerce/account friction → conversion-friction panel),
 *   sentiment, urgency, handover, topic.
 *
 * Supersedes enrich-backfill.mjs + reenrich-sections.mjs (which were a JH-only,
 * ski-hardcoded 2-pass). Bot-scoped work query (fast, ~10s/bot — not the whole-history
 * view), resort-local `day`, resumable (skips already-enriched), concurrent, PII-scrubbed,
 * 429 back-off, running cost. JH (43) is already fully enriched → this finds 0 work there.
 *
 *   node enrich.mjs [botId=43] [maxConvs]        # real run (writes report.conversation_intel)
 *   node enrich.mjs 275 --dry [sampleSize=12]    # READ-ONLY preview: classify a sample, print, no writes
 */
import 'dotenv/config'
import pg from 'pg'
import { VERTICALS, MIN_CONFIDENCE, compositeSections, verticalLabel } from './verticals.mjs'

const args = process.argv.slice(2)
const BOT = Number(args[0] || 43)
const DRY = args.includes('--dry')
const NUMS = args.slice(1).filter((a) => /^\d+$/.test(a)).map(Number)
const MAX = NUMS.length ? NUMS[0] : (DRY ? 12 : Infinity)
const MODEL = 'gpt-4o-mini'
const CONC = 10, CHUNK = 150
const PRICE_IN = 0.15, PRICE_OUT = 0.60
const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }

// Universal support spine (kept for cross-partner comparability).
const SPINE = [
  'Booking / Reservations', 'Pricing & Availability', 'Payments / Billing',
  'Refunds / Cancellations', 'Policies & Rules', 'Account / Access',
  'Technical Problems', 'Product / Service Info', 'Complaints / Service Issues',
  'Human / Escalation', 'Emergency / Safety', 'Other',
]
// Universal ecommerce/account friction — the SAME shape across every vertical.
const PINCHPOINTS = [
  'Login', 'Password reset', 'Account access', 'Order lookup', 'Payment',
  'Checkout', 'Booking change', 'Confirmation', 'Waiver', 'Credit', 'Voucher', 'None',
]

// Vertical + its section preset are AUTO-DETECTED per bot (report.bot_vertical,
// written by detect-vertical.mjs) from the shared registry in verticals.mjs — resolved
// after the DB connects (below). Replaces the old hand-maintained BOT_VERTICAL map.
// SPINE + PINCHPOINTS above are the universal "master" layer (same across every vertical).
let V // { label, sections } for this bot's detected vertical (assigned post-connect)

const buildSystem = (v) => `You are ShredIntel's conversation classifier for the guest-services chat assistant of a ${v.label}.
Read the whole conversation (guest + bot turns) and classify the GUEST's need. Return ONLY minified JSON:
{"substantive":true|false,"category":<one CATEGORY>,"section":<one SECTION>,"pinchpoint":<one PINCHPOINT>,"sentiment":"Positive"|"Neutral"|"Negative","urgency":"Low"|"Medium"|"High"|"Escalation Required","handover":"No Handover"|"Possible Handover"|"Clear Handover","topic":"<max 8 words, the specific ask, no names/emails/phones>"}
CATEGORY = the universal support bucket, exactly one of: ${SPINE.join('; ')}.
SECTION = the ${v.label} knowledge area the question belongs to, exactly one of: ${v.sections.join('; ')}.
PINCHPOINT = the specific e-commerce/account friction if the guest is stuck buying, accessing an account, or managing an order; otherwise "None". Exactly one of: ${PINCHPOINTS.join('; ')}.
substantive=false ONLY for pure greetings, pleasantries, or tests with NO question or request (e.g. "hi", "hello", "thanks", "ok", "test"). A SHORT message is STILL substantive if it asks or requests anything — "how's the snow today?", "rentals phone number", "hours?", "can I talk to a real person" are all substantive=true. When in doubt, default to substantive=true.
Do not invent. Base everything on the actual messages.`
let SYSTEM // built once V is resolved (post-connect, below)

const scrub = (s) => (s || '')
  .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
  .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')

// Voice turns arrive as (often double-encoded) JSON {role, content, timestamp} —
// the timestamp object balloons token cost and the classifier shouldn't have to
// parse JSON. Pull the human text out; plain chat text passes straight through.
function cleanText(s) {
  if (!s) return ''
  s = String(s).trim()
  if (s[0] === '{' || s[0] === '"') {
    try {
      let o = JSON.parse(s)
      if (typeof o === 'string') { try { o = JSON.parse(o) } catch { return o.trim() } }
      if (o && typeof o === 'object') return String(o.content ?? o.text ?? o.message ?? '').trim()
    } catch { /* not JSON — fall through to raw */ }
  }
  return s
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function classify(transcript, tries = 5) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: transcript }],
        }),
      })
      if (res.status === 429 || res.status >= 500) throw new Error('retry ' + res.status)
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 120)}`)
      const j = await res.json()
      return { data: JSON.parse(j.choices[0].message.content), usage: j.usage }
    } catch (e) { if (a === tries - 1) throw e; await sleep(800 * (a + 1) + Math.random() * 400) }
  }
}
async function pool(items, size, fn) {
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  }))
}
// Normalize the model output to the allowed value sets (never store a hallucinated label).
const norm = (d) => ({
  substantive: !!d.substantive,
  category: SPINE.includes(d.category) ? d.category : 'Other',
  section: V.sections.includes(d.section) ? d.section : 'Other',
  pinchpoint: PINCHPOINTS.includes(d.pinchpoint) ? d.pinchpoint : 'None',
  sentiment: d.sentiment || 'Neutral', urgency: d.urgency || 'Low',
  handover: d.handover || 'No Handover', topic: (d.topic || '').slice(0, 200),
})

// Fetch + assemble PII-scrubbed transcripts for a set of conversation ids.
async function transcripts(c, ids) {
  const { rows: msgs } = await c.query(`
    select h.conversation_id cid,
           case when coalesce(h.is_from_support,0)=1 then 'SUPPORT'
                when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
           coalesce(nullif(h.formatted_chat_history->>'text',''), nullif(h.message->>'text',''),
                    nullif(h.message->>'content',''), nullif(h.formatted_chat_history->>'content',''),
                    h.message #>> '{}') txt
      from raw.admin_chat_history h
     where h.conversation_id = any($1) and h.is_message=1 and coalesce(h.visible,1)=1
     order by h.conversation_id, h."timestamp"`, [ids])
  const t = new Map()
  for (const m of msgs) {
    const txt = scrub(cleanText(m.txt)).replace(/\s+/g, ' ').trim()
    if (!txt) continue
    const arr = t.get(String(m.cid)) || []
    arr.push(`${m.sender}: ${txt}`)
    t.set(String(m.cid), arr)
  }
  return t
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// Resolve this bot's vertical from the auto-detection (report.bot_vertical). The
// confidence gate (< MIN_CONFIDENCE) falls back to the `generic` preset so a
// low-confidence guess never applies the wrong section taxonomy. Missing row →
// generic + a nudge to run detect-vertical.mjs first.
const _bv = (await c.query('select vertical, confidence, also from report.bot_vertical where bot_id=$1', [BOT])).rows[0]
const _vkey = _bv && (_bv.confidence == null || _bv.confidence >= MIN_CONFIDENCE) && VERTICALS[_bv.vertical] ? _bv.vertical : 'generic'
// Composite: a bot can carry secondary facets (e.g. ski + water park). Union their
// section taxonomies so questions on either side of the resort have a home.
const _also = (_bv?.also || []).filter((k) => VERTICALS[k] && k !== _vkey)
V = _also.length
  ? { label: verticalLabel(_vkey, _also), sections: compositeSections(_vkey, _also), status: VERTICALS[_vkey].status }
  : VERTICALS[_vkey]
SYSTEM = buildSystem(V)
if (!_bv) console.log(`  ⚠ bot ${BOT} has no report.bot_vertical row — run detect-vertical.mjs; using "${V.label}"`)
else console.log(`  vertical: ${V.label}${_vkey !== _bv.vertical ? ` (detected ${_bv.vertical} @ ${_bv.confidence}, below gate → generic)` : ` @ conf ${_bv.confidence}`}${_also.length ? ` [composite: +${_also.join(', ')}]` : ''}`)

// ── DRY: read-only preview — sample, classify, print. No writes. ─────────────
if (DRY) {
  await c.query("set statement_timeout='60000ms'")
  console.log(`DRY preview · bot ${BOT} · vertical="${V.label}" · sampling ${MAX} engaged conversations …\n`)
  const { rows: ids } = await c.query(`
    select cv.id from raw.admin_conversation cv
    join raw.admin_user u on u.id = cv.user_id and u.bot_id = $1
    where cv.started_at >= '2024-10-01'
      and exists (select 1 from raw.admin_chat_history h where h.conversation_id = cv.id
        and coalesce(h.is_message,1)=1 and coalesce(h.is_echo,false)=false
        and coalesce(h.is_from_support,0)=0 and coalesce(h.visible,1)=1)
    order by random() limit $2`, [BOT, MAX])
  const t = await transcripts(c, ids.map((r) => r.id))
  for (const [cid, lines] of t) {
    try {
      const { data } = await classify(lines.join('\n').slice(0, 4000))
      const d = norm(data)
      const firstU = (lines.find((l) => l.startsWith('USER:')) || '').slice(6, 64)
      console.log(`${d.substantive ? '✓' : '·'} [${d.section}] ⟨${d.category}⟩ pinch:${d.pinchpoint}  ${d.sentiment}/${d.urgency}  "${d.topic}"\n     ⟵ ${firstU}`)
    } catch (e) { console.log('ERR', e.message) }
  }
  await c.end()
  console.log('\n(dry run — nothing written)')
  process.exit(0)
}

// ── REAL: backfill report.conversation_intel ─────────────────────────────────
// Big resorts (Mountain Creek 133k, Big Snow 128k…) have a slow work query — the
// per-conversation engagement EXISTS scan. Raise the timeout so it can't be
// cancelled by the DB default (which was fine for small bots but not these).
await c.query("set statement_timeout='900000ms'")
await c.query(`
  create table if not exists report.conversation_intel (
    bot_id int not null, conversation_id bigint primary key, day date,
    substantive boolean, category text, section text, pinchpoint text,
    sentiment text, urgency text, handover text, topic text,
    model text, enriched_at timestamptz default now()
  )`)
await c.query(`alter table report.conversation_intel add column if not exists section text`)
await c.query(`alter table report.conversation_intel add column if not exists pinchpoint text`)
await c.query(`create index if not exists conversation_intel_bot_day on report.conversation_intel (bot_id, day)`)
await c.query(`grant select on report.conversation_intel to anon, authenticated`)

// Bot-scoped work query: this bot's engaged conversations not yet enriched, with
// resort-local `day` (matches report._conversations_v). Indexed, ~10s/bot.
const { rows: todo } = await c.query(`
  select cv.id as conversation_id,
         ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz, 'America/Denver'))::date as day
    from raw.admin_conversation cv
    join raw.admin_user u on u.id = cv.user_id and u.bot_id = $1
    left join report.bot_timezone tz on tz.bot_id = u.bot_id
   where cv.started_at >= '2024-10-01'
     and exists (select 1 from raw.admin_chat_history h
        where h.conversation_id = cv.id and coalesce(h.is_message,1)=1
          and coalesce(h.is_echo,false)=false and coalesce(h.is_from_support,0)=0
          and coalesce(h.visible,1)=1)
     and not exists (select 1 from report.conversation_intel ci where ci.conversation_id = cv.id)
   order by cv.started_at desc`, [BOT])
const work = todo.slice(0, MAX)
console.log(`bot ${BOT} · vertical="${V.label}" · ${todo.length} engaged conversations to enrich${work.length < todo.length ? ` (capped ${work.length})` : ''}`)

let done = 0, failed = 0, inTok = 0, outTok = 0
const t0 = Date.now()

for (let s = 0; s < work.length; s += CHUNK) {
  const chunk = work.slice(s, s + CHUNK)
  const dayById = new Map(chunk.map((r) => [String(r.conversation_id), r.day]))
  const t = await transcripts(c, chunk.map((r) => r.conversation_id))

  const rows = []
  await pool([...t.entries()], CONC, async ([cid, lines]) => {
    try {
      const { data, usage } = await classify(lines.join('\n').slice(0, 4000))
      inTok += usage.prompt_tokens; outTok += usage.completion_tokens; done++
      const d = norm(data)
      rows.push([BOT, Number(cid), dayById.get(cid) || null, d.substantive, d.category,
        d.section, d.pinchpoint, d.sentiment, d.urgency, d.handover, d.topic, MODEL])
    } catch { failed++ }
  })
  // conversations with no extractable text: store a neutral shell so we don't re-loop them
  for (const r of chunk) if (!t.has(String(r.conversation_id)))
    rows.push([BOT, Number(r.conversation_id), r.day, false, 'Other', 'Other', 'None',
      'Neutral', 'Low', 'No Handover', '', MODEL])

  if (rows.length) {
    const ph = rows.map((_, i) => { const b = i * 12
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})` }).join(',')
    await c.query(`insert into report.conversation_intel
      (bot_id,conversation_id,day,substantive,category,section,pinchpoint,sentiment,urgency,handover,topic,model)
      values ${ph} on conflict (conversation_id) do nothing`, rows.flat())
  }
  const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
  console.log(`  ${done}/${work.length} · ${failed} failed · $${cost.toFixed(3)} · ${(done / ((Date.now() - t0) / 1000)).toFixed(1)}/s`)
}

const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
console.log(`\n── enrich complete ── ${done} enriched, ${failed} failed (retry next run), cost $${cost.toFixed(3)}`)
await c.end()
console.log('done.')
