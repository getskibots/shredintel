/**
 * Analyzes voice AI export CSVs from Botscrew (Mountain Collective voice bot).
 * Streams multiple files, respects quoted multi-line fields, produces JSON.
 *
 * Usage: node analyze-voice.mjs <csv...>
 */

import { createReadStream } from 'node:fs'

const FILES = process.argv.slice(2)
if (FILES.length === 0) {
  console.error('Usage: node analyze-voice.mjs <csv...>')
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

function pagePathOnly(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch { return url.split('?')[0] }
}

function inc(map, key) { map.set(key, (map.get(key) ?? 0) + 1) }
function top(map, n = 20) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n) }

const t = {
  totalRows: 0,
  uniqueConversations: new Set(),
  bots: new Map(),
  platforms: new Map(),
  outcomeMsg: new Map(),
  outcomeConv: new Map(), // conv_id -> outcome
  statusMsg: new Map(),
  statusConvSet: new Map(), // conv_id -> Set<status>
  senderType: new Map(),
  devices: new Map(),
  deviceConv: new Map(),
  browsers: new Map(),
  browserLangs: new Map(),
  countries: new Map(),
  countryConv: new Map(),
  inWorking: { true: 0, false: 0, '': 0 },
  redirectMsg: { true: 0, false: 0, '': 0 },
  redirectConv: new Set(), // conv_ids that had at least one redirect=true
  knowledgeQueries: new Map(),
  pagePathsConv: new Map(),
  earliestTimestamp: null,
  latestTimestamp: null,
  hourOfDay: new Map(),
  dayOfWeek: new Map(),
  conversationStarted: new Map(), // conv_id -> ISO
}

for (const file of FILES) {
  process.stderr.write(`\n--- ${file} ---\n`)
  let lineNo = 0
  let headers = null
  let kept = 0

  for await (const cols of readRecords(file)) {
    lineNo++
    if (lineNo === 1) continue
    if (lineNo === 2) { headers = cols; continue }
    if (!headers || cols.length < headers.length - 4) continue
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
    t.totalRows++
    kept++

    const cid = row.conversation_id
    if (cid) t.uniqueConversations.add(cid)

    const botKey = `${row.bot_id} | ${row.bot_name}`
    inc(t.bots, botKey)

    inc(t.platforms, row.platform || '(empty)')
    inc(t.outcomeMsg, row.conversation_outcome || '(empty)')
    inc(t.statusMsg, row.status || '(empty)')
    inc(t.senderType, row.sender_type || '(empty)')
    inc(t.devices, row.device_category || '(empty)')
    inc(t.browsers, row.browser || '(empty)')
    inc(t.browserLangs, row.browser_language || '(empty)')
    inc(t.countries, row.ip_address_country || '(empty)')

    if (row.is_in_working_hours === 'true') t.inWorking.true++
    else if (row.is_in_working_hours === 'false') t.inWorking.false++
    else t.inWorking['']++

    const redirect = row.is_redirect_phone_number_provided
    if (redirect === 'true') {
      t.redirectMsg.true++
      if (cid) t.redirectConv.add(cid)
    } else if (redirect === 'false') t.redirectMsg.false++
    else t.redirectMsg['']++

    if (row.knowledge_search_query && row.knowledge_search_query.trim() !== '') {
      const q = row.knowledge_search_query.slice(0, 200)
      inc(t.knowledgeQueries, q)
    }

    if (cid) {
      if (row.conversation_outcome) t.outcomeConv.set(cid, row.conversation_outcome)
      if (row.status) {
        let s = t.statusConvSet.get(cid)
        if (!s) { s = new Set(); t.statusConvSet.set(cid, s) }
        s.add(row.status)
      }
      if (!t.deviceConv.has(cid) && row.device_category) t.deviceConv.set(cid, row.device_category)
      if (!t.countryConv.has(cid) && row.ip_address_country) t.countryConv.set(cid, row.ip_address_country)
      const path = pagePathOnly(row.page_url)
      if (path && !t.pagePathsConv.has(cid)) t.pagePathsConv.set(cid, path)
    }

    if (row.timestamp) {
      const d = new Date(row.timestamp)
      if (!isNaN(d.getTime())) {
        const iso = d.toISOString()
        if (!t.earliestTimestamp || iso < t.earliestTimestamp) t.earliestTimestamp = iso
        if (!t.latestTimestamp || iso > t.latestTimestamp) t.latestTimestamp = iso
        inc(t.hourOfDay, d.getUTCHours())
        inc(t.dayOfWeek, d.getUTCDay())
        if (cid && !t.conversationStarted.has(cid)) t.conversationStarted.set(cid, iso)
      }
    }

    if (lineNo % 100000 === 0) process.stderr.write(`  ${lineNo.toLocaleString()} records\n`)
  }
  process.stderr.write(`  total kept: ${kept.toLocaleString()}\n`)
}

// Per-conversation aggregates
const convOutcome = { SOLVED: 0, UNENGAGED: 0, FAILED: 0, other: 0 }
for (const v of t.outcomeConv.values()) {
  if (v === 'SOLVED') convOutcome.SOLVED++
  else if (v === 'UNENGAGED') convOutcome.UNENGAGED++
  else if (v === 'FAILED') convOutcome.FAILED++
  else convOutcome.other++
}
let conversionsConv = 0
for (const s of t.statusConvSet.values()) if (s.has('CONVERTED')) conversionsConv++

// Page paths aggregated per conversation
const pagePathBuckets = new Map()
for (const v of t.pagePathsConv.values()) inc(pagePathBuckets, v)

const deviceConvBuckets = new Map()
for (const v of t.deviceConv.values()) inc(deviceConvBuckets, v)
const countryConvBuckets = new Map()
for (const v of t.countryConv.values()) inc(countryConvBuckets, v)

const report = {
  files: FILES,
  totalRows: t.totalRows,
  uniqueConversations: t.uniqueConversations.size,
  dateRange: { earliest: t.earliestTimestamp, latest: t.latestTimestamp },
  bots: Object.fromEntries(t.bots),
  platforms: Object.fromEntries(t.platforms),
  outcomeMessageLevel: Object.fromEntries(t.outcomeMsg),
  outcomeConversationLevel: convOutcome,
  conversationsWithConverted: conversionsConv,
  statusMessageLevel: Object.fromEntries(t.statusMsg),
  senderType: Object.fromEntries(t.senderType),
  deviceMessageLevel: Object.fromEntries(t.devices),
  deviceConversationLevel: Object.fromEntries(deviceConvBuckets),
  browsers: Object.fromEntries(t.browsers),
  browserLangs: Object.fromEntries(t.browserLangs),
  inWorkingHours: t.inWorking,
  redirectMessageLevel: t.redirectMsg,
  redirectConversations: t.redirectConv.size,
  handoffRate: t.uniqueConversations.size > 0 ? t.redirectConv.size / t.uniqueConversations.size : 0,
  topKnowledgeQueries: top(t.knowledgeQueries, 25),
  topCountries: top(countryConvBuckets, 15),
  topPagePathsConv: top(pagePathBuckets, 20),
  hourOfDayUTC: Object.fromEntries([...t.hourOfDay].sort((a, b) => a[0] - b[0])),
  dayOfWeekUTC: Object.fromEntries([...t.dayOfWeek].sort((a, b) => a[0] - b[0])),
}

console.log(JSON.stringify(report, null, 2))
