/**
 * Computes call-time metrics from the voice export following the GPT spec:
 *   total_talk_time = last timestamp - first timestamp (per conversation_id)
 *   time_with_ai    = total_talk_time if no human handoff,
 *                     else first_human_time - first timestamp
 *   time_with_human = last timestamp - first_human_time
 * Human signal: sender_type=SUPPORT | is_from_support=true | conversation_outcome=ESCALATED
 *
 * Usage: node call-time-metrics.mjs <csv...>
 */

import { createReadStream } from 'node:fs'

const FILES = process.argv.slice(2)
if (FILES.length === 0) {
  console.error('Usage: node call-time-metrics.mjs <csv...>')
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

/** Map of conversation_id -> aggregate */
const conv = new Map()

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
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : NaN
    if (isNaN(ts)) continue

    let agg = conv.get(cid)
    if (!agg) {
      agg = { first: ts, last: ts, firstHuman: null, outcome: null, hasHuman: false }
      conv.set(cid, agg)
    }
    if (ts < agg.first) agg.first = ts
    if (ts > agg.last) agg.last = ts

    if (row.conversation_outcome === 'ESCALATED') {
      agg.outcome = 'ESCALATED'
      agg.hasHuman = true
    }
    const isHuman = row.sender_type === 'SUPPORT' || row.is_from_support === 'true'
    if (isHuman) {
      agg.hasHuman = true
      if (agg.firstHuman === null || ts < agg.firstHuman) agg.firstHuman = ts
    }

    if (lineNo % 200000 === 0) process.stderr.write(`  ${lineNo.toLocaleString()} records · ${conv.size.toLocaleString()} convs\n`)
  }
}

// Aggregate
const talkTimes = [] // seconds
const aiTimes = []   // seconds
const humanTimes = [] // seconds (only for human-involved convs with a support timestamp)

let humanInvolvedCount = 0
let aiOnlyCount = 0
let humanWithoutTimestampCount = 0
let under30s = 0
let over2min = 0
let over5min = 0
let longest = 0

for (const [, a] of conv) {
  const total = Math.max(0, (a.last - a.first) / 1000)
  talkTimes.push(total)
  if (total > longest) longest = total
  if (total < 30) under30s++
  if (total > 120) over2min++
  if (total > 300) over5min++

  if (a.hasHuman) {
    humanInvolvedCount++
    if (a.firstHuman !== null) {
      const aiPortion = Math.max(0, (a.firstHuman - a.first) / 1000)
      const humanPortion = Math.max(0, (a.last - a.firstHuman) / 1000)
      aiTimes.push(aiPortion)
      humanTimes.push(humanPortion)
    } else {
      // ESCALATED but no support timestamp — count call but no human time
      humanWithoutTimestampCount++
      // We still allocate the whole call to AI
      aiTimes.push(total)
    }
  } else {
    aiOnlyCount++
    aiTimes.push(total)
  }
}

function sum(arr) { return arr.reduce((s, v) => s + v, 0) }
function median(arr) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}
function avg(arr) { return arr.length === 0 ? 0 : sum(arr) / arr.length }

const totalTalk = sum(talkTimes)
const totalAi = sum(aiTimes)
const totalHuman = sum(humanTimes)

const report = {
  totalCalls: conv.size,
  callDistribution: {
    under30s,
    under30sShare: under30s / Math.max(1, conv.size),
    over2min,
    over2minShare: over2min / Math.max(1, conv.size),
    over5min,
    over5minShare: over5min / Math.max(1, conv.size),
    longestCallSeconds: Math.round(longest),
  },
  totalTalk: {
    totalSeconds: Math.round(totalTalk),
    totalHours: +(totalTalk / 3600).toFixed(1),
    avgSecondsPerCall: +avg(talkTimes).toFixed(1),
    medianSecondsPerCall: +median(talkTimes).toFixed(1),
  },
  ai: {
    totalSeconds: Math.round(totalAi),
    totalHours: +(totalAi / 3600).toFixed(1),
    avgSecondsPerCall: +avg(aiTimes).toFixed(1),
    medianSecondsPerCall: +median(aiTimes).toFixed(1),
  },
  human: {
    totalSeconds: Math.round(totalHuman),
    totalHours: +(totalHuman / 3600).toFixed(1),
    avgSecondsPerHumanCall: +avg(humanTimes).toFixed(1),
    medianSecondsPerHumanCall: +median(humanTimes).toFixed(1),
  },
  involvement: {
    aiOnlyCalls: aiOnlyCount,
    humanInvolvedCalls: humanInvolvedCount,
    humanInvolvedWithoutTimestamp: humanWithoutTimestampCount,
    humanHandoffRate: humanInvolvedCount / Math.max(1, conv.size),
    aiTalkShare: totalTalk > 0 ? totalAi / totalTalk : 0,
    humanTalkShare: totalTalk > 0 ? totalHuman / totalTalk : 0,
  },
}

console.log(JSON.stringify(report, null, 2))
