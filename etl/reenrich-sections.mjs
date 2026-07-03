#!/usr/bin/env node
/**
 * reenrich-sections.mjs — re-classify enriched conversations onto the RESORT
 * KNOWLEDGE SECTION taxonomy (topic) + the ECOMMERCE PINCHPOINT dimension
 * (cross-cutting conversion/account friction), keeping sentiment/urgency/
 * handover/summary. Updates report.conversation_intel in place. Resumable
 * (only rows where section is null), concurrent, PII-scrubbed, cost-tracked.
 *
 *   node reenrich-sections.mjs [botId=43]
 */
import 'dotenv/config'
import pg from 'pg'

const BOT = Number(process.argv[2] || 43)
const MODEL = 'gpt-4o-mini'
const CONC = 10, CHUNK = 150
const PRICE_IN = 0.15, PRICE_OUT = 0.60
const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }

// Resort knowledge sections (guest-facing topics) — the Ski Resort Preset.
const SECTIONS = [
  'General Info', 'Tickets', 'Season Passes', 'Partner Pass Programs',
  'Ski & Snowboard Lessons', 'Ski & Snowboard Rentals', 'Refund Policies',
  'Winter Activities', 'Tubing', 'Summer Activities', 'Lodging', 'Dining & Après',
  'Guest Services & Safety', 'Parking & Transit', 'Events', 'Pet & Service Animals',
  'Packing & Gear', 'Employment', 'Ecommerce / Account Management', 'Other',
]
// Ecommerce / account friction (cross-cutting; "None" when not applicable).
const PINCHPOINTS = [
  'Login', 'Password reset', 'Account access', 'Order lookup', 'Payment',
  'Checkout', 'Booking change', 'Confirmation', 'Waiver', 'Credit', 'Voucher', 'None',
]

const SYSTEM = `You are ShredIntel's conversation classifier for the Jackson Hole ski resort chat assistant.
Read the whole conversation (guest + bot turns) and classify the GUEST's need. Return ONLY minified JSON:
{"substantive":true|false,"section":<one SECTION>,"pinchpoint":<one PINCHPOINT>,"sentiment":"Positive"|"Neutral"|"Negative","urgency":"Low"|"Medium"|"High"|"Escalation Required","handover":"No Handover"|"Possible Handover"|"Clear Handover","summary":"<max 8 words, specific ask, no names/emails/phones>"}
SECTION = the resort knowledge area the question belongs to, exactly one of: ${SECTIONS.join('; ')}.
PINCHPOINT = the specific e-commerce/account friction if the guest is stuck buying, accessing an account, or managing an order; otherwise "None". Exactly one of: ${PINCHPOINTS.join('; ')}.
substantive=false ONLY for greeting-only / no real intent. Do not invent; base on the actual messages.`

const scrub = (s) => (s || '')
  .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
  .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
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

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(`alter table report.conversation_intel add column if not exists section text`)
await c.query(`alter table report.conversation_intel add column if not exists pinchpoint text`)

const { rows: todo } = await c.query(
  `select conversation_id from report.conversation_intel where bot_id=$1 and section is null`, [BOT])
console.log(`bot ${BOT}: ${todo.length} conversations to re-classify (section + pinchpoint)`)

let done = 0, failed = 0, inTok = 0, outTok = 0
const t0 = Date.now()

for (let s = 0; s < todo.length; s += CHUNK) {
  const ids = todo.slice(s, s + CHUNK).map((r) => r.conversation_id)
  const { rows: msgs } = await c.query(`
    select h.conversation_id cid,
           case when coalesce(h.is_from_support,0)=1 then 'SUPPORT'
                when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
           coalesce(nullif(h.formatted_chat_history->>'text',''), h.message->>'text', h.message #>> '{}') txt
      from raw.admin_chat_history h
     where h.conversation_id = any($1) and h.is_message=1 and coalesce(h.visible,1)=1
     order by h.conversation_id, h."timestamp"`, [ids])
  const t = new Map()
  for (const m of msgs) {
    if (!m.txt || !m.txt.trim()) continue
    const arr = t.get(String(m.cid)) || []; arr.push(`${m.sender}: ${scrub(m.txt).replace(/\s+/g, ' ').trim()}`); t.set(String(m.cid), arr)
  }
  const out = []
  await pool([...t.entries()], CONC, async ([cid, lines]) => {
    try {
      const { data, usage } = await classify(lines.join('\n').slice(0, 4000))
      inTok += usage.prompt_tokens; outTok += usage.completion_tokens; done++
      out.push([Number(cid),
        SECTIONS.includes(data.section) ? data.section : 'Other',
        PINCHPOINTS.includes(data.pinchpoint) ? data.pinchpoint : 'None',
        data.sentiment, data.urgency, data.handover, !!data.substantive, (data.summary || '').slice(0, 200)])
    } catch { failed++ }
  })
  // also cover any conv with no extractable text (mark done so we don't loop)
  for (const id of ids) if (![...t.keys()].includes(String(id))) out.push([Number(id), 'Other', 'None', 'Neutral', 'Low', 'No Handover', false, ''])

  if (out.length) {
    const cols = out[0].map((_, k) => out.map((r) => r[k]))
    await c.query(`
      update report.conversation_intel ci set
        section=v.section, pinchpoint=v.pinchpoint, sentiment=v.sentiment,
        urgency=v.urgency, handover=v.handover, substantive=v.substantive, topic=v.summary, model=$9
      from (select * from unnest($1::bigint[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::bool[],$8::text[])
            as t(conversation_id, section, pinchpoint, sentiment, urgency, handover, substantive, summary)) v
      where ci.conversation_id = v.conversation_id`,
      [cols[0], cols[1], cols[2], cols[3], cols[4], cols[5], cols[6], cols[7], MODEL])
  }
  const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
  console.log(`  ${done}/${todo.length} · ${failed} failed · $${cost.toFixed(3)} · ${(done / ((Date.now() - t0) / 1000)).toFixed(1)}/s`)
}
const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
console.log(`\n── re-enrich complete ── ${done} updated, ${failed} failed, $${cost.toFixed(3)}`)
await c.end()
console.log('done.')
