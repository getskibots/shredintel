/**
 * POST /api/spin — FREERIDE's action-loop.
 *
 * Body: { botId, from, to, question, current? }
 *   current = the slice currently on screen ({ dims, measure, filters }), so a
 *   follow-up like "now by sentiment" or "just checkout" spins from it.
 *
 * Flow: question (+ current slice) → the LLM picks a CUBE SLICE from the catalog
 * (never SQL) → runSlice() executes the deterministic, parameterized query →
 * we choose a chart shape → return { spec, rows, chartType, answer, followups }.
 *
 * The LLM's entire vocabulary is the catalog keys, and buildSlice() re-validates
 * every key server-side, so a slice can never be malformed or injected. The API
 * key lives only here.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chat } from './_lib/llm.js'
import { runSlice } from './_lib/cube-query.js'
import { cubeGrounding, DIM_BY_KEY } from '../src/lib/cube.js'

export const maxDuration = 30

const ISO = /^\d{4}-\d{2}-\d{2}$/

interface SliceAction {
  dims: string[]
  measure: string
  filters?: Record<string, string>
  answer?: string
  followups?: string[]
}

function systemPrompt(current: unknown): string {
  const cur = current ? JSON.stringify(current) : 'none (this is the first question)'
  return [
    'You are Freeride, a conversational explorer over a resort\'s chat + voice analytics.',
    'Translate the user\'s question into a CUBE SLICE. You do NOT write SQL — you pick keys from a fixed catalog.',
    '',
    cubeGrounding(),
    '',
    'Return ONLY this JSON, nothing else:',
    '{',
    '  "dims": ["<dimension key>"],        // 1 or 2 keys from DIMENSIONS (the axes / grouping)',
    '  "measure": "<measure key>",          // exactly 1 key from MEASURES',
    '  "filters": { "<dim key>": "<value>" },// optional subset; omit if none',
    '  "answer": "<one plain sentence naming what the chart shows>",',
    '  "followups": ["<a natural next spin>", "<another>"]  // 2-3 short questions',
    '}',
    '',
    'Rules:',
    '- Use ONLY keys that appear in the catalog above. Never invent a key.',
    '- For a filter on a dimension that lists [values: ...], use one of those exact values. For open faces (topic, page, city) use the user\'s own phrase.',
    '- CHOOSING THE MEASURE matters as much as the face. When the question is about a QUALITY, use the matching RATE, never conversations:',
    '    frustrated / unhappy / negative -> negative_rate ; cannot answer / does not know / gaps / unresolved -> unresolved_rate ;',
    '    losing sales / at risk / abandoning -> at_risk_rate ; ready to buy / intent to book -> ready_to_book_rate ;',
    '    needs a human / escalate / agent -> handover_rate ; urgent / pressing -> high_urgency_rate ; how long -> avg_duration.',
    '    Use conversations ONLY for plain volume questions (how many, busiest, where guests come from).',
    '- Keep dims to ONE unless the user explicitly asks to break one face down by another.',
    '- If the user is spinning the CURRENT slice, start from it and change ONLY what they asked.',
    '- A "where" or "which" question puts a place / journey / topic face on the axis (funnel_stage, page, section, category, city, region), NOT the face the measure is derived from.',
    '- A "when" question puts a TIME face on the axis (hour, dow, day, month).',
    '- Never chart a rate against its own source face: at_risk_rate + ready_to_book_rate are about revenue, negative_rate about sentiment, resolved_rate + unresolved_rate about resolution, handover_rate about handover. Do NOT also use that face as a dim; show WHERE it is highest instead.',
    '',
    'Examples (question -> dims / measure):',
    '  "Where am I losing sales?" -> ["funnel_stage"] / at_risk_rate',
    '  "What frustrates guests, and about what?" -> ["section"] / negative_rate',
    '  "When do I most need a human?" -> ["hour"] / handover_rate',
    '  "What cannot the bot answer?" -> ["section"] / unresolved_rate',
    '  "Where do guests come from?" -> ["city"] / conversations',
    '',
    `Current slice: ${cur}`,
  ].join('\n')
}

/** Chart shape follows the slice shape (the picker gets smarter later). */
function pickChart(dims: string[]): 'bar' | 'line' | 'grouped-bar' {
  if (dims.length >= 2) return 'grouped-bar'
  return DIM_BY_KEY[dims[0]]?.group === 'time' ? 'line' : 'bar'
}

function cleanFollowups(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter((s) => s && s.length <= 120).slice(0, 3)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const botId = Number(body.botId)
    const from = String(body.from ?? '')
    const to = String(body.to ?? '')
    const question = String(body.question ?? '').trim()
    if (!botId) return res.status(400).json({ error: 'botId is required' })
    if (!ISO.test(from) || !ISO.test(to) || from > to) return res.status(400).json({ error: 'a valid from/to date range is required' })
    if (!question) return res.status(400).json({ error: 'question is required' })

    // 1) question (+ current slice) → a slice action (catalog keys, not SQL)
    const raw = await chat({
      system: systemPrompt(body.current),
      user: question,
      json: true,
      maxTokens: 400,
    })
    let action: SliceAction
    try {
      action = JSON.parse(raw)
    } catch {
      return res.status(502).json({ error: 'model did not return a valid slice' })
    }

    // 2) run the deterministic, validated slice (buildSlice throws on any bad key)
    let result
    try {
      result = await runSlice({
        botId,
        from,
        to,
        dims: Array.isArray(action.dims) ? action.dims.map(String) : [],
        measure: String(action.measure || 'conversations'),
        filters: action.filters && typeof action.filters === 'object' ? action.filters : undefined,
        source: body.source === 'voice' ? 'voice' : 'chat',
      })
    } catch (e) {
      return res.status(422).json({ error: `couldn't build that view: ${e instanceof Error ? e.message : 'invalid slice'}`, action })
    }

    // 3) shape the response
    return res.status(200).json({
      spec: result.spec,
      rows: result.rows,
      chartType: pickChart(result.spec.dims.map((d) => d.key)),
      answer: String(action.answer || '').slice(0, 400),
      followups: cleanFollowups(action.followups),
      sql: result.sql, // transparency: the exact query behind the number
    })
  } catch (e) {
    console.error('[api/spin] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
