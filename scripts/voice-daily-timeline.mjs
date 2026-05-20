/**
 * Produces a per-day timeline of voice-call metrics from the export,
 * plus a call-length histogram and human-involvement breakdown.
 *
 * Output is the canonical source of truth for the /voice fixtures —
 * downstream code filters this array by period (last 7d / 30d / 90d / all).
 *
 * Usage: node voice-daily-timeline.mjs <csv...> > voice-daily.json
 */

import { createReadStream } from 'node:fs'

const FILES = process.argv.slice(2)
if (FILES.length === 0) {
  console.error('Usage: node voice-daily-timeline.mjs <csv...>')
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

// Conversation aggregates
const conv = new Map() // cid -> { firstTs, lastTs, firstHumanTs, hasHuman, outcome, startedAt: ISO date }
// MT-local hour heatmap (cells by day-of-week + 3h bucket) — driven by call start
const heatmap = new Map() // key "DOW|BUCKET" -> { conversations, userMessages }

const MT_BUCKETS = ['12AM–3AM','3AM–6AM','6AM–9AM','9AM–12PM','12PM–3PM','3PM–6PM','6PM–9PM','9PM–12AM']
const DAYS_LOCAL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] // matches new Date.getDay()

function mtHourFromUtc(utcDate) {
  const local = new Date(utcDate.getTime() - 7 * 3600 * 1000)
  return { hour: local.getUTCHours(), dow: local.getUTCDay() }
}
function bucketFor(hour) {
  if (hour < 3) return '12AM–3AM'
  if (hour < 6) return '3AM–6AM'
  if (hour < 9) return '6AM–9AM'
  if (hour < 12) return '9AM–12PM'
  if (hour < 15) return '12PM–3PM'
  if (hour < 18) return '3PM–6PM'
  if (hour < 21) return '6PM–9PM'
  return '9PM–12AM'
}

let userMessagesTotal = 0

for (const file of FILES) {
  process.stderr.write(`--- ${file} ---\n`)
  let lineNo = 0
  let headers = null
  for await (const cols of readRecords(file)) {
    lineNo++
    if (lineNo === 1) continue
    if (lineNo === 2) { headers = cols; continue }
    if (!headers || cols.length < headers.length - 4) continue
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
    const cid = row.conversation_id
    if (!cid) continue
    const ts = row.timestamp ? new Date(row.timestamp) : null
    if (!ts || isNaN(ts.getTime())) continue
    const tsMs = ts.getTime()

    let agg = conv.get(cid)
    if (!agg) {
      agg = { firstTs: tsMs, lastTs: tsMs, firstHumanTs: null, hasHuman: false, outcome: null, startedAt: ts.toISOString() }
      conv.set(cid, agg)
    }
    if (tsMs < agg.firstTs) { agg.firstTs = tsMs; agg.startedAt = ts.toISOString() }
    if (tsMs > agg.lastTs) agg.lastTs = tsMs

    if (row.conversation_outcome) agg.outcome = row.conversation_outcome
    const isHuman = row.sender_type === 'SUPPORT' || row.is_from_support === 'true'
    if (isHuman) {
      agg.hasHuman = true
      if (agg.firstHumanTs === null || tsMs < agg.firstHumanTs) agg.firstHumanTs = tsMs
    }
    if (row.conversation_outcome === 'ESCALATED') agg.hasHuman = true

    if (row.sender_type === 'USER') userMessagesTotal++
  }
}

// Build daily timeline (UTC date of call start)
const dailyMap = new Map()
const durations = [] // seconds
const aiDurations = []
const humanDurations = []
let aiOnly = 0, humanInvolved = 0, humanWithoutTs = 0
let totalTalkSec = 0, totalAiSec = 0, totalHumanSec = 0
let longest = 0
let under30 = 0, over120 = 0, over300 = 0

// Length histogram buckets (seconds)
const HIST_BUCKETS = [
  { label: '0–10s',     lo: 0,    hi: 10 },
  { label: '10–30s',    lo: 10,   hi: 30 },
  { label: '30s–1m',    lo: 30,   hi: 60 },
  { label: '1–2m',      lo: 60,   hi: 120 },
  { label: '2–5m',      lo: 120,  hi: 300 },
  { label: '5–10m',     lo: 300,  hi: 600 },
  { label: '10m+',      lo: 600,  hi: Infinity },
]
const histCounts = HIST_BUCKETS.map(() => 0)

for (const [, a] of conv) {
  const total = (a.lastTs - a.firstTs) / 1000
  durations.push(total)
  totalTalkSec += total
  if (total > longest) longest = total
  if (total < 30) under30++
  if (total > 120) over120++
  if (total > 300) over300++

  // Histogram
  for (let i = 0; i < HIST_BUCKETS.length; i++) {
    const b = HIST_BUCKETS[i]
    if (total >= b.lo && total < b.hi) { histCounts[i]++; break }
  }

  // Daily bucket — by UTC start date
  const day = a.startedAt.slice(0, 10)
  let d = dailyMap.get(day)
  if (!d) {
    d = {
      date: day,
      calls: 0,
      solved: 0,
      unengaged: 0,
      totalTalkSeconds: 0,
      avgTalkSeconds: 0,
      humanInvolvedCalls: 0,
    }
    dailyMap.set(day, d)
  }
  d.calls++
  d.totalTalkSeconds += total
  if (a.outcome === 'SOLVED') d.solved++
  else if (a.outcome === 'UNENGAGED') d.unengaged++
  if (a.hasHuman) d.humanInvolvedCalls++

  // AI vs Human partition
  if (a.hasHuman) {
    humanInvolved++
    if (a.firstHumanTs !== null) {
      const aiPortion = (a.firstHumanTs - a.firstTs) / 1000
      const humanPortion = (a.lastTs - a.firstHumanTs) / 1000
      aiDurations.push(aiPortion)
      humanDurations.push(humanPortion)
      totalAiSec += aiPortion
      totalHumanSec += humanPortion
    } else {
      humanWithoutTs++
      aiDurations.push(total)
      totalAiSec += total
    }
  } else {
    aiOnly++
    aiDurations.push(total)
    totalAiSec += total
  }

  // MT-local heatmap (3h × DOW)
  const startUtc = new Date(a.firstTs)
  const { hour, dow } = mtHourFromUtc(startUtc)
  const bucket = bucketFor(hour)
  const key = `${DAYS_LOCAL[dow]}|${bucket}`
  const cell = heatmap.get(key) ?? { dayOfWeek: DAYS_LOCAL[dow], timeBucket: bucket, conversations: 0 }
  cell.conversations++
  heatmap.set(key, cell)
}

// Daily averages + sort
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
for (const d of daily) d.avgTalkSeconds = d.calls > 0 ? +(d.totalTalkSeconds / d.calls).toFixed(1) : 0

// Fill in missing days as zeros (so the timeline is continuous)
if (daily.length > 0) {
  const start = new Date(daily[0].date + 'T00:00:00Z')
  const end = new Date(daily[daily.length - 1].date + 'T00:00:00Z')
  const filled = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10)
    const found = dailyMap.get(day)
    if (found) filled.push(found)
    else filled.push({ date: day, calls: 0, solved: 0, unengaged: 0, totalTalkSeconds: 0, avgTalkSeconds: 0, humanInvolvedCalls: 0 })
  }
  daily.length = 0
  daily.push(...filled)
}

function median(arr) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}
function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length }

const totalCalls = conv.size
const histogram = HIST_BUCKETS.map((b, i) => ({
  label: b.label,
  lo: b.lo,
  hi: b.hi === Infinity ? null : b.hi,
  count: histCounts[i],
  share: histCounts[i] / Math.max(1, totalCalls),
}))

const heatmapArr = [...heatmap.values()].sort((a, b) =>
  DAYS_LOCAL.indexOf(a.dayOfWeek) - DAYS_LOCAL.indexOf(b.dayOfWeek) ||
  MT_BUCKETS.indexOf(a.timeBucket) - MT_BUCKETS.indexOf(b.timeBucket)
)

const report = {
  generatedAt: new Date().toISOString(),
  totalCalls,
  dailyTimeline: daily,
  callLengthHistogram: histogram,
  perCall: {
    avgTalkSeconds: +avg(durations).toFixed(1),
    medianTalkSeconds: +median(durations).toFixed(1),
    longestCallSeconds: Math.round(longest),
    under30sCount: under30,
    under30sShare: under30 / totalCalls,
    over2minCount: over120,
    over2minShare: over120 / totalCalls,
    over5minCount: over300,
    over5minShare: over300 / totalCalls,
  },
  workload: {
    totalTalkSeconds: Math.round(totalTalkSec),
    totalAiSeconds: Math.round(totalAiSec),
    totalHumanSeconds: Math.round(totalHumanSec),
    aiTalkShare: totalAiSec / Math.max(1, totalTalkSec),
    humanTalkShare: totalHumanSec / Math.max(1, totalTalkSec),
    aiOnlyCalls: aiOnly,
    humanInvolvedCalls: humanInvolved,
    humanInvolvedWithoutTimestamp: humanWithoutTs,
    handoffRate: humanInvolved / Math.max(1, totalCalls),
    avgAiSeconds: +avg(aiDurations).toFixed(1),
    medianAiSeconds: +median(aiDurations).toFixed(1),
    avgHumanSecondsPerHumanCall: +avg(humanDurations).toFixed(1),
    medianHumanSecondsPerHumanCall: +median(humanDurations).toFixed(1),
  },
  userMessages: userMessagesTotal,
  heatmap: heatmapArr,
}

console.log(JSON.stringify(report, null, 2))
