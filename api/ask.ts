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
import { voiceAnswerInstruction } from './_lib/voices.js'

// Two model calls + DB round-trips can take a bit; give the function headroom.
export const maxDuration = 30

/** Keep only a well-formed drill hint (dimension in the allowed set + a value). */
function sanitizeDrill(d: unknown): { dimension: string; value: string; label: string } | null {
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  const dimension = String(o.dimension || '')
  const value = String(o.value || '').trim()
  if (!['section', 'pinchpoint', 'sentiment'].includes(dimension) || !value) return null
  return { dimension, value, label: String(o.label || value).slice(0, 60) }
}

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
    // Scope every generated query to the dashboard's selected date range so the
    // answer reconciles with the panels below. Only accept well-formed ISO dates.
    const ISO = /^\d{4}-\d{2}-\d{2}$/
    const from = String(body.from ?? '')
    const to = String(body.to ?? '')
    const window = ISO.test(from) && ISO.test(to) && from <= to ? { from, to } : undefined
    // Optional custom instructions (from the in-app AI-instructions editor) —
    // appended after the fixed grounding; capped to bound the prompt.
    const instructions = String(body.instructions || '').slice(0, 2000).trim()
    const system = systemPrompt(botId, catalog, window, instructions || undefined)

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

    // 3) rows → answer + chart hint. Voice mode swaps in the selected ShredIntel
    // persona instruction (api/_lib/voices.ts) for a spoken-friendly reply.
    const answerInstruction =
      body.mode === 'voice' ? voiceAnswerInstruction(body.voiceId) : ANSWER_INSTRUCTION
    const ansJson = await chat({
      system,
      user: `Question: ${question}\nResult rows (JSON): ${JSON.stringify(rows).slice(0, 4000)}\n\n${answerInstruction}`,
      json: true,
      maxTokens: 500,
    })
    let answer = ''
    let chart: unknown = null
    let vegaLite: unknown = null
    let focus: unknown = null
    let drill: unknown = null
    try {
      const parsed = JSON.parse(ansJson)
      answer = String(parsed.answer || '')
      chart = parsed.chart ?? null
      vegaLite = parsed.vegaLite ?? null
      focus = parsed.focus ?? null
      drill = sanitizeDrill(parsed.drill)
    } catch {
      answer = ansJson
    }

    return res.status(200).json({ answer, chart, vegaLite, focus, drill, sql, rows: rows.slice(0, 100) })
  } catch (e) {
    console.error('[api/ask] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
