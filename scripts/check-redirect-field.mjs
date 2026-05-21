/**
 * Audits `is_redirect_phone_number_provided` — the true human-handover signal.
 * Counts:
 *  - distinct values it takes
 *  - message-level non-empty occurrences
 *  - conversations that had at least one non-empty occurrence
 *  - shows a few example values + the messages around them
 */

import { createReadStream } from 'node:fs'

const FILES = process.argv.slice(2)

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

const valueCounts = new Map()
const convsWithRedirect = new Set()
const allConvs = new Set()
let messagesWithValue = 0
let totalMessages = 0
const samples = []
// Adjacent signals
const isFromSupportCounts = new Map()
const senderTypeCounts = new Map()
const outcomeCounts = new Map()
const convsWithSupportSender = new Set()
const convsWithIsFromSupport = new Set()
const convsWithEscalatedOutcome = new Set()

for (const file of FILES) {
  process.stderr.write(`--- ${file} ---\n`)
  let lineNo = 0
  let headers = null
  for await (const cols of readRecords(file)) {
    lineNo++
    if (lineNo === 1) continue
    if (lineNo === 2) { headers = cols; continue }
    if (!headers) continue
    const row = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
    totalMessages++
    const cid = row.conversation_id
    if (cid) allConvs.add(cid)
    const val = row.is_redirect_phone_number_provided ?? ''
    valueCounts.set(val, (valueCounts.get(val) ?? 0) + 1)
    const ifs = row.is_from_support ?? ''
    isFromSupportCounts.set(ifs, (isFromSupportCounts.get(ifs) ?? 0) + 1)
    const st = row.sender_type ?? ''
    senderTypeCounts.set(st, (senderTypeCounts.get(st) ?? 0) + 1)
    const oc = row.conversation_outcome ?? ''
    outcomeCounts.set(oc, (outcomeCounts.get(oc) ?? 0) + 1)
    if (st === 'SUPPORT' && cid) convsWithSupportSender.add(cid)
    if (ifs === 'true' && cid) convsWithIsFromSupport.add(cid)
    if (oc === 'ESCALATED' && cid) convsWithEscalatedOutcome.add(cid)
    if (val.trim() !== '' && val !== 'false') {
      messagesWithValue++
      if (cid) convsWithRedirect.add(cid)
      if (samples.length < 12) {
        samples.push({
          value: val,
          conversation_id: cid,
          sender: row.sender_type,
          outcome: row.conversation_outcome,
          message: (row.message || '').slice(0, 160),
        })
      }
    }
  }
}

const report = {
  totalMessages,
  totalConversations: allConvs.size,
  is_redirect_phone_number_provided: {
    distinctValues: [...valueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([v, n]) => ({ value: v.length > 40 ? v.slice(0, 40) + '…' : v, length: v.length, count: n })),
    messagesWithNonEmptyValue: messagesWithValue,
    conversationsWithAtLeastOneValue: convsWithRedirect.size,
    samples,
  },
  adjacentSignals: {
    sender_type: Object.fromEntries(senderTypeCounts),
    is_from_support: Object.fromEntries(isFromSupportCounts),
    conversation_outcome: Object.fromEntries(outcomeCounts),
    convsWithSupportSenderType: convsWithSupportSender.size,
    convsWithIsFromSupportTrue: convsWithIsFromSupport.size,
    convsWithEscalatedOutcome: convsWithEscalatedOutcome.size,
  },
}

console.log(JSON.stringify(report, null, 2))
