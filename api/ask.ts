/**
 * POST /api/ask  — the ShredIntel AI endpoint.
 *   body: { botId: number, question?: string, templateId?: string }
 *   → { answer, chart, sql, rows }
 * GET  /api/ask  — returns the prompt library (chips for the Ask bar).
 *
 * Flow: question → LLM writes SQL (scoped to botId, report.* only) → validate
 * → run read-only → LLM summarizes rows into a plain answer + chart hint.
 * The API key lives only here (server-side); the browser never sees it.
 *
 * TODO(hardening): per-bot/session rate limit + token cap before public embed.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chat } from './_lib/llm.js'
import { runReadOnly, schemaCatalog, validateSql } from './_lib/db.js'
import { PROMPT_LIBRARY, systemPrompt, SQL_INSTRUCTION, ANSWER_INSTRUCTION } from './_lib/prompts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ templates: PROMPT_LIBRARY })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const botId = Number(body.botId)
    if (!botId) return res.status(400).json({ error: 'botId is required' })

    let question: string | undefined = body.question
    if (body.templateId) {
      const t = PROMPT_LIBRARY.find((t) => t.id === body.templateId)
      if (t) question = t.question
    }
    if (!question) return res.status(400).json({ error: 'question or templateId is required' })

    const catalog = await schemaCatalog()
    if (!catalog) return res.status(503).json({ error: 'no report views available yet' })
    const system = systemPrompt(botId, catalog)

    // 1) question → SQL
    const sqlJson = await chat({ system, user: `${question}\n\n${SQL_INSTRUCTION}`, json: true, maxTokens: 500 })
    let sql: string
    try {
      sql = String(JSON.parse(sqlJson).sql || '')
    } catch {
      return res.status(502).json({ error: 'model did not return valid SQL JSON' })
    }
    const v = validateSql(sql)
    if (!v.ok) return res.status(400).json({ error: `unsafe query: ${v.reason}`, sql })

    // 2) run (read-only, timeout, capped)
    const rows = await runReadOnly(sql)

    // 3) rows → plain-English answer + chart hint
    const ansJson = await chat({
      system,
      user: `Question: ${question}\nResult rows (JSON): ${JSON.stringify(rows).slice(0, 4000)}\n\n${ANSWER_INSTRUCTION}`,
      json: true,
      maxTokens: 500,
    })
    let answer = ''
    let chart: unknown = null
    try {
      const parsed = JSON.parse(ansJson)
      answer = String(parsed.answer || '')
      chart = parsed.chart ?? null
    } catch {
      answer = ansJson
    }

    return res.status(200).json({ answer, chart, sql, rows: rows.slice(0, 100) })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
