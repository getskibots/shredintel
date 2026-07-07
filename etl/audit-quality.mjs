#!/usr/bin/env node
/**
 * audit-quality.mjs — enrichment-quality check via LLM-as-JUDGE. Samples enriched
 * conversations and has a STRONGER model (gpt-4o) independently judge each stored
 * label against the transcript, then reports per-field agreement % + the actual
 * disagreements to eyeball. The judge is a second opinion, not ground truth — a
 * flagged disagreement means "look at this one," not "definitely wrong."
 *
 * Read-only (reads conversation_intel + transcripts; calls OpenAI). Sampled bots
 * 43 + 17 are both ski resorts → ski vertical label sets.
 *
 *   node audit-quality.mjs [botId ...]      (default 43 17)
 *   N_SUB / N_NON env vars set sample sizes (default 15 substantive + 5 non).
 */
import 'dotenv/config'
import pg from 'pg'

const JUDGE = process.env.JUDGE_MODEL || 'gpt-4o'
const N_SUB = Number(process.env.N_SUB || 15)
const N_NON = Number(process.env.N_NON || 5)
const KEY = (process.env.OPENAI_API_KEY || '').trim()
if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }
const TARGETS = process.argv.slice(2).map(Number).filter(Boolean)
const BOTS = TARGETS.length ? TARGETS : [43, 17]

const SKI = ['General Info', 'Tickets', 'Season Passes', 'Partner Pass Programs', 'Ski & Snowboard Lessons', 'Ski & Snowboard Rentals', 'Refund Policies', 'Winter Activities', 'Tubing', 'Summer Activities', 'Lodging', 'Dining & Après', 'Guest Services & Safety', 'Parking & Transit', 'Events', 'Pet & Service Animals', 'Packing & Gear', 'Employment', 'Ecommerce / Account Management', 'Other']
const SPINE = ['Booking / Reservations', 'Pricing & Availability', 'Payments / Billing', 'Refunds / Cancellations', 'Policies & Rules', 'Account / Access', 'Technical Problems', 'Product / Service Info', 'Complaints / Service Issues', 'Human / Escalation', 'Emergency / Safety', 'Other']
const PINCH = ['Login', 'Password reset', 'Account access', 'Order lookup', 'Payment', 'Checkout', 'Booking change', 'Confirmation', 'Waiver', 'Credit', 'Voucher', 'None']
const FIELDS = ['substantive', 'section', 'category', 'sentiment', 'urgency', 'handover', 'pinchpoint', 'topic']

const JUDGE_SYS = `You are a strict QA auditor for a ski-resort chat-analytics classifier. You receive ONE guest↔bot conversation (USER = guest, BOT = assistant) and the labels an automated classifier assigned. INDEPENDENTLY decide whether each label is CORRECT for this conversation — form your own judgment first, then compare.
Allowed values —
 substantive: true|false (false ONLY for greeting-only / no real ask, e.g. "hi", "thanks", "test").
 section: ${SKI.join('; ')}.
 category: ${SPINE.join('; ')}.
 sentiment: Positive|Neutral|Negative.  urgency: Low|Medium|High|Escalation Required.
 handover: No Handover|Possible Handover|Clear Handover.
 pinchpoint (only if the guest is stuck buying / accessing an account / managing an order, else None): ${PINCH.join('; ')}.
 topic: short free text of the guest's specific ask.
Be fair, not pedantic: for section/category pick the SINGLE best fit and mark ok=true on reasonable close calls; for topic, ok=true if the meaning matches even if worded differently. Return ONLY minified JSON:
{"substantive":{"ok":bool,"should":val},"section":{"ok":bool,"should":val},"category":{"ok":bool,"should":val},"sentiment":{"ok":bool,"should":val},"urgency":{"ok":bool,"should":val},"handover":{"ok":bool,"should":val},"pinchpoint":{"ok":bool,"should":val},"topic":{"ok":bool,"note":"short"}}`

const scrub = (s) => (s || '').replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]').replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')

async function pool(items, size, fn) {
  let i = 0; const out = []
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) } }))
  return out
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='120000ms'")

async function transcripts(ids) {
  const { rows } = await c.query(`
    select h.conversation_id cid,
           case when coalesce(h.is_from_support,0)=1 then 'SUPPORT' when coalesce(h.is_echo,false) then 'BOT' else 'USER' end sender,
           coalesce(nullif(h.formatted_chat_history->>'text',''), h.message->>'text', h.message #>> '{}') txt
      from raw.admin_chat_history h
     where h.conversation_id = any($1) and h.is_message=1 and coalesce(h.visible,1)=1
     order by h.conversation_id, h."timestamp"`, [ids])
  const t = new Map()
  for (const m of rows) { if (!m.txt || !m.txt.trim()) continue; const a = t.get(String(m.cid)) || []; a.push(`${m.sender}: ${scrub(m.txt).replace(/\s+/g, ' ').trim()}`); t.set(String(m.cid), a) }
  return t
}

async function judge(transcript, labels) {
  const user = `CONVERSATION:\n${transcript}\n\nCLASSIFIER LABELS:\n${JSON.stringify(labels)}`
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: JUDGE, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: JUDGE_SYS }, { role: 'user', content: user }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 140))
  return JSON.parse(j.choices[0].message.content)
}

let grand = Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, n: 0 }]))
for (const bot of BOTS) {
  const name = (await c.query(`select name from public.bots where id=$1`, [bot])).rows[0]?.name || `bot ${bot}`
  const { rows: sample } = await c.query(`
    (select conversation_id, substantive, category, section, pinchpoint, sentiment, urgency, handover, topic
       from report.conversation_intel where bot_id=$1 and substantive order by random() limit $2)
    union all
    (select conversation_id, substantive, category, section, pinchpoint, sentiment, urgency, handover, topic
       from report.conversation_intel where bot_id=$1 and not substantive order by random() limit $3)`, [bot, N_SUB, N_NON])
  const tmap = await transcripts(sample.map((r) => r.conversation_id))

  const tally = Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, n: 0 }]))
  const diffs = []
  await pool(sample, 5, async (row) => {
    const lines = tmap.get(String(row.conversation_id))
    if (!lines) return
    const labels = { substantive: row.substantive, section: row.section, category: row.category, sentiment: row.sentiment, urgency: row.urgency, handover: row.handover, pinchpoint: row.pinchpoint, topic: row.topic }
    try {
      const v = await judge(lines.join('\n').slice(0, 4000), labels)
      const firstU = (lines.find((l) => l.startsWith('USER:')) || lines[0] || '').slice(0, 60)
      for (const f of FIELDS) {
        if (!v[f] || typeof v[f].ok !== 'boolean') continue
        tally[f].n++; grand[f].n++
        if (v[f].ok) { tally[f].ok++; grand[f].ok++ }
        else diffs.push({ f, cid: row.conversation_id, was: labels[f], should: v[f].should ?? v[f].note, u: firstU })
      }
    } catch (e) { console.log(`  (judge err cid ${row.conversation_id}: ${e.message.slice(0, 50)})`) }
  })

  console.log(`\n${'═'.repeat(64)}\n  BOT ${bot} — ${name}   ·   judge ${JUDGE} · n=${sample.length}\n${'═'.repeat(64)}`)
  let ok = 0, tot = 0
  for (const f of FIELDS) { const t = tally[f]; ok += t.ok; tot += t.n; console.log(`  ${f.padEnd(13)} ${t.n ? (100 * t.ok / t.n).toFixed(0).padStart(3) + '%' : '  —'}   (${t.ok}/${t.n})`) }
  console.log(`  ${'OVERALL'.padEnd(13)} ${tot ? (100 * ok / tot).toFixed(0).padStart(3) : '—'}%   (${ok}/${tot} field-judgments agree)`)
  if (diffs.length) {
    console.log(`\n  flagged for review (classifier → judge):`)
    for (const d of diffs.slice(0, 12)) console.log(`   ${d.f.padEnd(11)} ${String(d.was).slice(0, 22).padEnd(22)} → ${String(d.should).slice(0, 26).padEnd(26)}  ⟵ ${d.u}`)
    if (diffs.length > 12) console.log(`   … +${diffs.length - 12} more`)
  }
}

console.log(`\n${'═'.repeat(64)}\n  OVERALL AGREEMENT (all bots)\n${'═'.repeat(64)}`)
let gok = 0, gtot = 0
for (const f of FIELDS) { const t = grand[f]; gok += t.ok; gtot += t.n; console.log(`  ${f.padEnd(13)} ${t.n ? (100 * t.ok / t.n).toFixed(0).padStart(3) + '%' : '  —'}`) }
console.log(`  ${'TOTAL'.padEnd(13)} ${gtot ? (100 * gok / gtot).toFixed(0) : '—'}%   (${gok}/${gtot})`)
await c.end()
