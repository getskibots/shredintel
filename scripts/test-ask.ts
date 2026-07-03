/**
 * Local harness for the AI layer. Exercises the REAL backend code end-to-end
 * (question -> SQL -> guarded read-only run -> answer) against the live report
 * views, without deploying. Reads creds from etl/.env (add OPENAI_API_KEY there
 * for local testing).
 *
 *   npx tsx scripts/test-ask.ts 43 "what do guests ask about most?"
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('etl/.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const { chat, activeProvider } = await import('../api/_lib/llm')
const { runReadOnly, schemaCatalog } = await import('../api/_lib/db')
const { systemPrompt, SQL_INSTRUCTION, ANSWER_INSTRUCTION } = await import('../api/_lib/prompts')

const botId = Number(process.argv[2] || 43)
const question = process.argv.slice(3).join(' ') ||
  'What are the most common topics or knowledge sources guests ask about? Top 10 by volume.'

console.log(`provider: ${activeProvider()}   bot: ${botId}`)
const catalog = await schemaCatalog()
console.log(`\n── report views the AI can see ──\n${catalog}\n`)

const system = systemPrompt(botId, catalog)
const sqlJson = await chat({ system, user: `${question}\n\n${SQL_INSTRUCTION}`, json: true, maxTokens: 500 })
const sql = String(JSON.parse(sqlJson).sql || '')
console.log(`── generated SQL ──\n${sql}\n`)

const rows = await runReadOnly(sql)
console.log(`── rows (${rows.length}) ──\n${JSON.stringify(rows.slice(0, 5), null, 0)}\n`)

const ansJson = await chat({
  system,
  user: `Question: ${question}\nResult rows (JSON): ${JSON.stringify(rows).slice(0, 4000)}\n\n${ANSWER_INSTRUCTION}`,
  json: true, maxTokens: 500,
})
console.log(`── answer ──\n${ansJson}`)
