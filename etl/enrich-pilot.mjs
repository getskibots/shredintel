#!/usr/bin/env node
/**
 * enrich-pilot.mjs — ShredIntel AI enrichment pilot (Jackson Hole, bot 43).
 * Reconstructs per-conversation transcripts, scrubs direct PII, and classifies
 * each against the UNIVERSAL SPINE (+ sentiment / urgency / handover / topic)
 * via gpt-4o-mini. Runs on a small SAMPLE to validate quality + measure true
 * cost before any full backfill. Prints results + extrapolated cost.
 *
 *   node enrich-pilot.mjs [sampleSize]     (default 25)
 */
import 'dotenv/config'
import pg from 'pg'

const BOT = 43
const SAMPLE = Number(process.argv[2] || 25)
const MODEL = 'gpt-4o-mini'
const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }

// gpt-4o-mini pricing (USD per 1M tokens)
const PRICE_IN = 0.15, PRICE_OUT = 0.60

const SPINE = [
  'Booking / Reservations', 'Pricing & Availability', 'Payments / Billing',
  'Refunds / Cancellations', 'Policies & Rules', 'Account / Access',
  'Technical Problems', 'Product / Service Info', 'Complaints / Service Issues',
  'Human / Escalation', 'Emergency / Safety', 'Other',
]

const SYSTEM = `You are ShredIntel's conversation classifier for a ski-resort chat assistant.
Read the whole conversation (guest + bot turns) and classify the GUEST's intent.
Return ONLY minified JSON with these keys:
{"substantive":true|false,"category":<one of the list>,"sentiment":"Positive"|"Neutral"|"Negative","urgency":"Low"|"Medium"|"High"|"Escalation Required","handover":"No Handover"|"Possible Handover"|"Clear Handover","topic":"<max 8 words, the specific ask, no names/emails/phones>"}
category must be exactly one of: ${SPINE.join('; ')}.
substantive=false ONLY for greeting-only / no real intent (hi, thanks, test).
Do not invent. Base everything on the actual messages.`

const scrub = (s) => (s || '')
  .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
  .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')

async function classify(transcript) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: transcript }],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  return { data: JSON.parse(j.choices[0].message.content), usage: j.usage }
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log(`Sampling ${SAMPLE} engaged conversations from bot ${BOT} …`)
const { rows: ids } = await c.query(
  `select conversation_id from report._conversations_v where bot_id=$1 and is_engaged order by random() limit $2`,
  [BOT, SAMPLE])
const idList = ids.map((r) => r.conversation_id)

const { rows: msgs } = await c.query(`
  select h.conversation_id cid,
         case when coalesce(h.is_from_support,0)=1 then 'SUPPORT'
              when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
         coalesce(nullif(h.formatted_chat_history->>'text',''), h.message->>'text', h.message #>> '{}') txt,
         h."timestamp" ts
    from raw.admin_chat_history h
   where h.conversation_id = any($1) and h.is_message=1 and coalesce(h.visible,1)=1
   order by h.conversation_id, h."timestamp"`, [idList])

const byConv = new Map()
for (const m of msgs) {
  if (!m.txt || !m.txt.trim()) continue
  if (!byConv.has(m.cid)) byConv.set(m.cid, [])
  byConv.get(m.cid).push(`${m.sender}: ${scrub(m.txt).replace(/\s+/g, ' ').trim()}`)
}

let inTok = 0, outTok = 0, done = 0, excluded = 0
const catCount = {}, sentCount = {}
console.log(`\n${'conv'.padEnd(9)} ${'category'.padEnd(26)} ${'sent'.padEnd(9)} ${'urg'.padEnd(10)} topic`)
for (const [cid, lines] of byConv) {
  const transcript = lines.join('\n').slice(0, 4000)
  try {
    const { data, usage } = await classify(transcript)
    inTok += usage.prompt_tokens; outTok += usage.completion_tokens; done++
    if (!data.substantive) excluded++
    catCount[data.category] = (catCount[data.category] || 0) + 1
    sentCount[data.sentiment] = (sentCount[data.sentiment] || 0) + 1
    const tag = data.substantive ? '' : '  (excluded)'
    console.log(`${String(cid).padEnd(9)} ${String(data.category).padEnd(26)} ${String(data.sentiment).padEnd(9)} ${String(data.urgency).padEnd(10)} ${data.topic}${tag}`)
  } catch (e) { console.log(`${String(cid).padEnd(9)} ERROR ${e.message}`) }
}

const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
console.log(`\n── results ──`)
console.log(`  classified: ${done}   substantive: ${done - excluded}   excluded: ${excluded}`)
console.log(`  categories:`, JSON.stringify(catCount))
console.log(`  sentiment :`, JSON.stringify(sentCount))
console.log(`\n── cost (${MODEL}) ──`)
console.log(`  tokens: ${inTok} in + ${outTok} out`)
console.log(`  this run: $${cost.toFixed(4)}   per conv: $${(cost / Math.max(1, done)).toFixed(5)}`)
console.log(`  extrapolated to all 22,994 engaged JH convs: ~$${(cost / Math.max(1, done) * 22994).toFixed(2)}`)

await c.end()
console.log('\ndone.')
