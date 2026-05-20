import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const CSV = process.argv[2]

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === ',') { out.push(cur); cur = '' }
      else if (ch === '"') inQ = true
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

const rl = createInterface({ input: createReadStream(CSV, { encoding: 'utf8' }), crlfDelay: Infinity })
let lineNo = 0, headers = null
const botCounts = new Map()

for await (const line of rl) {
  lineNo++
  if (lineNo === 1) continue
  if (lineNo === 2) { headers = parseCsvLine(line); continue }
  const cols = parseCsvLine(line)
  const botIdIdx = headers.indexOf('bot_id')
  const botNameIdx = headers.indexOf('bot_name')
  const key = `${cols[botIdIdx]} | ${cols[botNameIdx]}`
  botCounts.set(key, (botCounts.get(key) ?? 0) + 1)
}

console.log(JSON.stringify(Object.fromEntries([...botCounts.entries()].sort((a, b) => b[1] - a[1])), null, 2))
