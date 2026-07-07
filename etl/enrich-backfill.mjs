#!/usr/bin/env node
/**
 * enrich-backfill.mjs — full ShredIntel enrichment backfill for one bot.
 * Creates report.conversation_intel (if needed) and classifies every engaged
 * conversation not yet enriched (spine category + sentiment / urgency / handover
 * / topic) via gpt-4o-mini. Resumable (skips already-done), concurrent, with
 * PII scrub, 429 back-off, running cost + progress.
 *
 *   node enrich-backfill.mjs [botId=43] [maxConvs=Infinity]
 */
import 'dotenv/config'
import pg from 'pg'

const BOT = Number(process.argv[2] || 43)
const MAX = Number(process.argv[3] || Infinity)
const MODEL = 'gpt-4o-mini'
const CONC = 10          // parallel OpenAI calls
const CHUNK = 150        // conversations per DB transcript fetch
const PRICE_IN = 0.15, PRICE_OUT = 0.60
const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }

const SPINE = [
  'Booking / Reservations', 'Pricing & Availability', 'Payments / Billing',
  'Refunds / Cancellations', 'Policies & Rules', 'Account / Access',
  'Technical Problems', 'Product / Service Info', 'Complaints / Service Issues',
  'Human / Escalation', 'Emergency / Safety', 'Other',
]
// Partners span verticals (Brandon 2026-07-07). The 12-bucket SPINE is universal
// business-support, so it works across all of them AND keeps partners comparable.
// But the prompt FRAMING should match the partner so the model doesn't force a
// ski reading of a water-park / transport / pass conversation (and so mascot-named
// bots like "Fred the Moose" = Grand Targhee are understood). Map the non-ski
// partners; everything else defaults to a ski resort.
const VERTICAL_MAP = {
  2: 'season / multi-resort pass product',        // Mountain Collective
  258: 'season / multi-resort pass product',      // Snow Triple Play
  275: 'indoor water park',                        // Splash Lagoon
  103: 'indoor ski & snow park',                   // Big Snow (American Dream)
  364: 'ground-transportation / shuttle service',  // Summit Express
  65: 'resort lodging / hotel',                    // Mountain Lodge Telluride
  140: 'cycling / gravel event',                   // SBT GRVL
  311: 'travel agency',                            // Outside Travel
  1: 'multi-resort lift-ticket marketplace',       // Get Ski Tickets
}
const VERTICAL = VERTICAL_MAP[BOT] || 'ski resort'
const SYSTEM = `You are ShredIntel's conversation classifier for the guest-services chat assistant of a ${VERTICAL}.
Read the whole conversation (guest + bot turns) and classify the GUEST's intent.
Return ONLY minified JSON with these keys:
{"substantive":true|false,"category":<one of the list>,"sentiment":"Positive"|"Neutral"|"Negative","urgency":"Low"|"Medium"|"High"|"Escalation Required","handover":"No Handover"|"Possible Handover"|"Clear Handover","topic":"<max 8 words, the specific ask, no names/emails/phones>"}
category must be exactly one of: ${SPINE.join('; ')}.
substantive=false ONLY for greeting-only / no real intent (hi, thanks, test).
Do not invent. Base everything on the actual messages.`

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
    } catch (e) {
      if (a === tries - 1) throw e
      await sleep(800 * (a + 1) + Math.random() * 400)
    }
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

await c.query(`
  create table if not exists report.conversation_intel (
    bot_id int not null,
    conversation_id bigint primary key,
    day date,
    substantive boolean,
    category text, sentiment text, urgency text, handover text, topic text,
    model text, enriched_at timestamptz default now()
  )`)
await c.query(`create index if not exists conversation_intel_bot_day on report.conversation_intel (bot_id, day)`)
await c.query(`grant select on report.conversation_intel to anon, authenticated`)

// Bot-scoped work query. report._conversations_v derives engagement in a CTE
// that re-aggregates the ENTIRE chat history on every call (40s+ per bot, times
// out at scale). Instead: filter to THIS bot's conversations first (admin_user.bot_id
// idx), then check engagement via the indexed EXISTS on admin_chat_history
// (conversation_id idx) → ~10s/bot. The engagement predicate + resort-local `day`
// (report.bot_timezone) match _conversations_v exactly, so the enriched set is identical.
const { rows: todo } = await c.query(`
  select cv.id as conversation_id,
         ((cv.started_at at time zone 'UTC') at time zone coalesce(tz.tz, 'America/Denver'))::date as day
    from raw.admin_conversation cv
    join raw.admin_user u on u.id = cv.user_id and u.bot_id = $1
    left join report.bot_timezone tz on tz.bot_id = u.bot_id
   where cv.started_at >= '2024-10-01'
     and exists (
       select 1 from raw.admin_chat_history h
        where h.conversation_id = cv.id and coalesce(h.is_message,1)=1
          and coalesce(h.is_echo,false)=false and coalesce(h.is_from_support,0)=0
          and coalesce(h.visible,1)=1)
     and not exists (select 1 from report.conversation_intel ci where ci.conversation_id = cv.id)
   order by cv.started_at desc`, [BOT])
const work = todo.slice(0, MAX)
console.log(`bot ${BOT}: ${todo.length} engaged conversations to enrich${work.length < todo.length ? ` (capped ${work.length})` : ''}`)

let done = 0, failed = 0, inTok = 0, outTok = 0
const t0 = Date.now()

for (let s = 0; s < work.length; s += CHUNK) {
  const chunk = work.slice(s, s + CHUNK)
  const ids = chunk.map((r) => r.conversation_id)
  const dayById = new Map(chunk.map((r) => [String(r.conversation_id), r.day]))

  const { rows: msgs } = await c.query(`
    select h.conversation_id cid,
           case when coalesce(h.is_from_support,0)=1 then 'SUPPORT'
                when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
           coalesce(nullif(h.formatted_chat_history->>'text',''), h.message->>'text', h.message #>> '{}') txt
      from raw.admin_chat_history h
     where h.conversation_id = any($1) and h.is_message=1 and coalesce(h.visible,1)=1
     order by h.conversation_id, h."timestamp"`, [ids])

  const transcripts = new Map()
  for (const m of msgs) {
    if (!m.txt || !m.txt.trim()) continue
    const arr = transcripts.get(String(m.cid)) || []
    arr.push(`${m.sender}: ${scrub(m.txt).replace(/\s+/g, ' ').trim()}`)
    transcripts.set(String(m.cid), arr)
  }

  const rowsToInsert = []
  await pool([...transcripts.entries()], CONC, async ([cid, lines]) => {
    try {
      const { data, usage } = await classify(lines.join('\n').slice(0, 4000))
      inTok += usage.prompt_tokens; outTok += usage.completion_tokens; done++
      rowsToInsert.push([BOT, Number(cid), dayById.get(cid) || null,
        !!data.substantive, data.category, data.sentiment, data.urgency, data.handover,
        (data.topic || '').slice(0, 200), MODEL])
    } catch { failed++ }
  })

  if (rowsToInsert.length) {
    const ph = rowsToInsert.map((_, i) => {
      const b = i * 10
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`
    }).join(',')
    await c.query(
      `insert into report.conversation_intel
       (bot_id,conversation_id,day,substantive,category,sentiment,urgency,handover,topic,model)
       values ${ph} on conflict (conversation_id) do nothing`, rowsToInsert.flat())
  }

  const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
  const rate = done / ((Date.now() - t0) / 1000)
  console.log(`  ${done}/${work.length} done · ${failed} failed · $${cost.toFixed(3)} · ${rate.toFixed(1)}/s`)
}

const cost = inTok * PRICE_IN / 1e6 + outTok * PRICE_OUT / 1e6
console.log(`\n── backfill complete ──`)
console.log(`  enriched: ${done}   failed (will retry next run): ${failed}`)
console.log(`  tokens: ${inTok} in + ${outTok} out   cost: $${cost.toFixed(3)}`)
await c.end()
console.log('done.')
