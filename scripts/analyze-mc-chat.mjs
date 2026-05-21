/**
 * Analyzes Mountain Collective chat CSVs. Same schema as JH chat (no
 * knowledge_search_query field — uses knowledge_top_source instead).
 * Outputs a daily timeline JSON + summary for the /chat/mc dashboard.
 *
 * Usage: node analyze-mc-chat.mjs <csv...> > mc-chat-daily.json
 */

import { createReadStream } from 'node:fs'

const FILES = process.argv.slice(2)
if (FILES.length === 0) {
  console.error('Usage: node analyze-mc-chat.mjs <csv...>')
  process.exit(1)
}

async function* readRecords(path) {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 16 })
  let row = []
  let field = ''
  let inQ = false
  const flush = () => { row.push(field); field = '' }
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]
      if (inQ) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') { field += '"'; i++ }
          else inQ = false
        } else field += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') flush()
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { flush(); yield row; row = [] }
        else field += ch
      }
    }
  }
  if (field.length > 0 || row.length > 0) { flush(); yield row }
}

function pagePath(url) {
  if (!url) return ''
  try { const u = new URL(url); return u.host + u.pathname }
  catch { return url.split('?')[0] }
}
function inc(map, key) { map.set(key, (map.get(key) ?? 0) + 1) }
function top(map, n = 25) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n) }

// Conversation aggregates (one entry per conversation_id)
const conv = new Map()
// Message-level totals (for knowledge-gap rate, sender mix)
const tot = {
  rows: 0,
  bots: new Map(),
  platforms: new Map(),
  senderType: new Map(),
  outcomeMsg: new Map(),
  statusMsg: new Map(),
  devicesMsg: new Map(),
  browsers: new Map(),
  langs: new Map(),
  countriesMsg: new Map(),
  botSourced: 0,
  botUnsourced: 0,
  topSources: new Map(),
}

for (const file of FILES) {
  process.stderr.write(`--- ${file} ---\n`)
  let lineNo = 0, headers = null
  for await (const cols of readRecords(file)) {
    lineNo++
    if (lineNo === 1) continue
    if (lineNo === 2) { headers = cols; continue }
    if (!headers || cols.length < headers.length - 4) continue
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
    tot.rows++
    inc(tot.bots, `${row.bot_id} | ${row.bot_name}`)
    inc(tot.platforms, row.platform || '(empty)')
    inc(tot.senderType, row.sender_type || '(empty)')
    inc(tot.outcomeMsg, row.conversation_outcome || '(empty)')
    inc(tot.statusMsg, row.status || '(empty)')
    inc(tot.devicesMsg, row.device_category || '(empty)')
    inc(tot.browsers, row.browser || '(empty)')
    inc(tot.langs, row.browser_language || '(empty)')
    inc(tot.countriesMsg, row.ip_address_country || '(empty)')

    if (row.sender_type === 'BOT') {
      const src = (row.knowledge_top_source || '').trim()
      if (src) {
        tot.botSourced++
        inc(tot.topSources, src.slice(0, 100))
      } else tot.botUnsourced++
    }

    const cid = row.conversation_id
    if (!cid) continue
    const ts = row.timestamp ? new Date(row.timestamp) : null
    if (!ts || isNaN(ts.getTime())) continue
    const tsMs = ts.getTime()
    let a = conv.get(cid)
    if (!a) {
      a = {
        first: tsMs, last: tsMs, outcome: null, status: null,
        startedAt: ts.toISOString(),
        device: null, country: null, lang: null, page: null,
        botMsgs: 0, userMsgs: 0, supportMsgs: 0,
      }
      conv.set(cid, a)
    }
    if (tsMs < a.first) { a.first = tsMs; a.startedAt = ts.toISOString() }
    if (tsMs > a.last) a.last = tsMs
    if (row.conversation_outcome) a.outcome = row.conversation_outcome
    if (row.status) a.status = row.status
    if (!a.device && row.device_category) a.device = row.device_category
    if (!a.country && row.ip_address_country) a.country = row.ip_address_country
    if (!a.lang && row.browser_language) a.lang = row.browser_language
    if (!a.page && row.page_url) a.page = pagePath(row.page_url)
    if (row.sender_type === 'BOT') a.botMsgs++
    else if (row.sender_type === 'USER') a.userMsgs++
    else if (row.sender_type === 'SUPPORT') a.supportMsgs++
  }
}

// Per-day timeline
const dailyMap = new Map()
const convOutcome = { SOLVED: 0, UNENGAGED: 0, FAILED: 0 }
const devicesConv = new Map()
const countriesConv = new Map()
const langsConv = new Map()
const pagesConv = new Map()
let supportTouched = 0

const MT_BUCKETS = ['12AM–3AM','3AM–6AM','6AM–9AM','9AM–12PM','12PM–3PM','3PM–6PM','6PM–9PM','9PM–12AM']
const DAYS_LOCAL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
function mtHour(d) { const l = new Date(d.getTime() - 7 * 3600000); return { hour: l.getUTCHours(), dow: l.getUTCDay() } }
function bucketFor(h) {
  if (h < 3) return '12AM–3AM'; if (h < 6) return '3AM–6AM'
  if (h < 9) return '6AM–9AM'; if (h < 12) return '9AM–12PM'
  if (h < 15) return '12PM–3PM'; if (h < 18) return '3PM–6PM'
  if (h < 21) return '6PM–9PM'; return '9PM–12AM'
}
const heat = new Map()

for (const [, a] of conv) {
  if (a.outcome === 'SOLVED') convOutcome.SOLVED++
  else if (a.outcome === 'UNENGAGED') convOutcome.UNENGAGED++
  else if (a.outcome === 'FAILED') convOutcome.FAILED++
  if (a.supportMsgs > 0) supportTouched++
  if (a.device) inc(devicesConv, a.device)
  if (a.country) inc(countriesConv, a.country)
  if (a.lang) inc(langsConv, a.lang)
  if (a.page) inc(pagesConv, a.page)

  const day = a.startedAt.slice(0, 10)
  let d = dailyMap.get(day)
  if (!d) {
    d = { date: day, conversations: 0, solved: 0, unengaged: 0, failed: 0, engaged: 0 }
    dailyMap.set(day, d)
  }
  d.conversations++
  if (a.outcome === 'SOLVED') d.solved++
  else if (a.outcome === 'UNENGAGED') d.unengaged++
  else if (a.outcome === 'FAILED') d.failed++
  if (a.outcome === 'SOLVED' || a.outcome === 'FAILED') d.engaged++

  // Heatmap by call start (MT-local)
  const start = new Date(a.first)
  const { hour, dow } = mtHour(start)
  const bucket = bucketFor(hour)
  const key = `${DAYS_LOCAL[dow]}|${bucket}`
  const cell = heat.get(key) ?? { dayOfWeek: DAYS_LOCAL[dow], timeBucket: bucket, conversations: 0 }
  cell.conversations++
  heat.set(key, cell)
}

// Sort daily + fill gaps
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
if (daily.length > 0) {
  const start = new Date(daily[0].date + 'T00:00:00Z')
  const end = new Date(daily[daily.length - 1].date + 'T00:00:00Z')
  const filled = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10)
    filled.push(dailyMap.get(day) ?? { date: day, conversations: 0, solved: 0, unengaged: 0, failed: 0, engaged: 0 })
  }
  daily.length = 0; daily.push(...filled)
}

const totalConv = conv.size
const heatmapArr = [...heat.values()].sort((a, b) =>
  DAYS_LOCAL.indexOf(a.dayOfWeek) - DAYS_LOCAL.indexOf(b.dayOfWeek) ||
  MT_BUCKETS.indexOf(a.timeBucket) - MT_BUCKETS.indexOf(b.timeBucket)
)

const report = {
  generatedAt: new Date().toISOString(),
  bots: Object.fromEntries(tot.bots),
  totalMessages: tot.rows,
  totalConversations: totalConv,
  dateRange: { earliest: daily[0]?.date, latest: daily[daily.length - 1]?.date, days: daily.length },
  outcomes: convOutcome,
  engaged: convOutcome.SOLVED + convOutcome.FAILED,
  supportTouchedConversations: supportTouched,
  knowledgeGap: {
    botSourced: tot.botSourced,
    botUnsourced: tot.botUnsourced,
    gapRate: tot.botUnsourced / Math.max(1, tot.botSourced + tot.botUnsourced),
  },
  topKnowledgeSources: top(tot.topSources, 25),
  topCountries: top(countriesConv, 15),
  deviceConvLevel: Object.fromEntries(devicesConv),
  topPages: top(pagesConv, 20),
  browsers: Object.fromEntries(tot.browsers),
  languages: top(langsConv, 10),
  dailyTimeline: daily,
  heatmap: heatmapArr,
}

console.log(JSON.stringify(report, null, 2))
