/**
 * Stream-parses the Jackson Hole CSV correctly, handling newlines and
 * commas inside quoted fields, and emits a JSON report.
 *
 * Usage: node analyze-jh.mjs <csv-path>
 */

import { createReadStream } from 'node:fs'

const CSV = process.argv[2]
if (!CSV) {
  console.error('Usage: node analyze-jh.mjs <csv-path>')
  process.exit(1)
}

// Streaming CSV record iterator that respects quoted newlines.
async function* readRecords(path) {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 16 })
  let buf = ''
  let row = []
  let field = ''
  let inQ = false

  function pushField() {
    row.push(field)
    field = ''
  }

  for await (const chunk of stream) {
    buf += chunk
    let i = 0
    while (i < buf.length) {
      const ch = buf[i]
      if (inQ) {
        if (ch === '"') {
          if (buf[i + 1] === '"') {
            field += '"'
            i += 2
            continue
          }
          inQ = false
          i++
          continue
        }
        field += ch
        i++
      } else {
        if (ch === '"') {
          inQ = true
          i++
        } else if (ch === ',') {
          pushField()
          i++
        } else if (ch === '\r') {
          i++
        } else if (ch === '\n') {
          pushField()
          yield row
          row = []
          i++
        } else {
          field += ch
          i++
        }
      }
    }
    // Keep only the unprocessed tail (rare with our state machine) — buf is consumed in full.
    buf = ''
  }
  // Final flush
  if (field.length > 0 || row.length > 0) {
    pushField()
    yield row
  }
}

function pagePathOnly(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch {
    return url.split('?')[0]
  }
}

function inc(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function top(map, n = 20) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

let groupHeaders = null
let headers = null
let recNo = 0

const t = {
  rows: 0,
  uniqueConversations: new Set(),
  bySenderType: new Map(),
  byOutcome: new Map(),
  byPlatform: new Map(),
  byStatus: new Map(),
  byDevice: new Map(),
  byBrowser: new Map(),
  byBrowserLang: new Map(),
  byCountry: new Map(),
  inWorkingHours: { true: 0, false: 0, '': 0 },
  botKnowledgeUsage: { hasSource: 0, noSource: 0 },
  topKnowledgeSources: new Map(),
  topPagePaths: new Map(),
  hourOfDay: new Map(),
  dayOfWeek: new Map(),
  // Per-conversation aggregation for true resolution rate
  conversationOutcome: new Map(), // conversation_id -> outcome
  conversationStatus: new Map(), // conversation_id -> set of statuses seen
  conversationDevice: new Map(),
  conversationCountry: new Map(),
  conversationFirstPage: new Map(),
}

for await (const cols of readRecords(CSV)) {
  recNo++
  if (recNo === 1) {
    groupHeaders = cols
    continue
  }
  if (recNo === 2) {
    headers = cols
    continue
  }
  if (cols.length < headers.length - 2) continue
  const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  if (row.bot_id !== '43') continue // belt-and-suspenders: keep only JH
  t.rows++
  const cid = row.conversation_id
  if (cid) t.uniqueConversations.add(cid)
  inc(t.bySenderType, row.sender_type || '(empty)')
  inc(t.byOutcome, row.conversation_outcome || '(empty)')
  inc(t.byPlatform, row.platform || '(empty)')
  inc(t.byStatus, row.status || '(empty)')
  inc(t.byDevice, row.device_category || '(empty)')
  inc(t.byBrowser, row.browser || '(empty)')
  inc(t.byBrowserLang, row.browser_language || '(empty)')
  inc(t.byCountry, row.ip_address_country || '(empty)')

  if (row.is_in_working_hours === 'true') t.inWorkingHours.true++
  else if (row.is_in_working_hours === 'false') t.inWorkingHours.false++
  else t.inWorkingHours['']++

  if (row.sender_type === 'BOT') {
    const src = (row.knowledge_top_source || '').trim()
    if (src) {
      t.botKnowledgeUsage.hasSource++
      inc(t.topKnowledgeSources, src.slice(0, 100))
    } else {
      t.botKnowledgeUsage.noSource++
    }
  }

  const path = pagePathOnly(row.page_url)
  if (path) inc(t.topPagePaths, path)

  if (row.timestamp) {
    const d = new Date(row.timestamp)
    if (!isNaN(d.getTime())) {
      inc(t.hourOfDay, d.getUTCHours())
      inc(t.dayOfWeek, d.getUTCDay())
    }
  }

  if (cid) {
    // Conversation-level outcome priority: prefer non-empty values
    if (row.conversation_outcome) t.conversationOutcome.set(cid, row.conversation_outcome)
    if (row.status) {
      let set = t.conversationStatus.get(cid)
      if (!set) { set = new Set(); t.conversationStatus.set(cid, set) }
      set.add(row.status)
    }
    if (!t.conversationDevice.has(cid) && row.device_category) {
      t.conversationDevice.set(cid, row.device_category)
    }
    if (!t.conversationCountry.has(cid) && row.ip_address_country) {
      t.conversationCountry.set(cid, row.ip_address_country)
    }
    if (!t.conversationFirstPage.has(cid) && path) {
      t.conversationFirstPage.set(cid, path)
    }
  }

  if (recNo % 100000 === 0) {
    process.stderr.write(`processed ${recNo.toLocaleString()} records\n`)
  }
}

// Aggregate per-conversation
const convCount = t.uniqueConversations.size
const convOutcome = { SOLVED: 0, UNENGAGED: 0, FAILED: 0, other: 0 }
for (const v of t.conversationOutcome.values()) {
  if (v === 'SOLVED') convOutcome.SOLVED++
  else if (v === 'UNENGAGED') convOutcome.UNENGAGED++
  else if (v === 'FAILED') convOutcome.FAILED++
  else convOutcome.other++
}
let converted = 0
for (const set of t.conversationStatus.values()) {
  if (set.has('CONVERTED')) converted++
}
const convDevice = new Map()
for (const v of t.conversationDevice.values()) inc(convDevice, v)
const convCountry = new Map()
for (const v of t.conversationCountry.values()) inc(convCountry, v)
const convPage = new Map()
for (const v of t.conversationFirstPage.values()) inc(convPage, v)

const report = {
  rowsKept: t.rows,
  uniqueConversations: convCount,
  bySenderType: Object.fromEntries(t.bySenderType),
  byOutcomeMessageLevel: Object.fromEntries(t.byOutcome),
  byOutcomeConversationLevel: convOutcome,
  resolvedConversations: convOutcome.SOLVED,
  conversationsWithConvertedStatus: converted,
  byPlatform: Object.fromEntries(t.byPlatform),
  byStatusMessageLevel: Object.fromEntries(t.byStatus),
  byDeviceMessageLevel: Object.fromEntries(t.byDevice),
  byDeviceConversationLevel: Object.fromEntries(convDevice),
  byBrowser: Object.fromEntries(t.byBrowser),
  byBrowserLang: Object.fromEntries(t.byBrowserLang),
  botKnowledgeUsage: t.botKnowledgeUsage,
  knowledgeGapRate:
    t.botKnowledgeUsage.noSource /
    Math.max(1, t.botKnowledgeUsage.noSource + t.botKnowledgeUsage.hasSource),
  topCountriesConv: top(convCountry, 15),
  topKnowledgeSources: top(t.topKnowledgeSources, 20),
  topPagePathsMessageLevel: top(t.topPagePaths, 20),
  topPagePathsConversationLevel: top(convPage, 20),
  hourOfDay: Object.fromEntries([...t.hourOfDay].sort((a, b) => a[0] - b[0])),
  dayOfWeek: Object.fromEntries([...t.dayOfWeek].sort((a, b) => a[0] - b[0])),
}

console.log(JSON.stringify(report, null, 2))
