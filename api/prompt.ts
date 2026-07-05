/**
 * GET  /api/prompt?botId=43  → { master, slave }  (the two editable AI layers)
 * POST /api/prompt           → { ok }  body: { scope: 'master'|'bot', botId, prompt }
 *
 * Backs the in-app AI-instructions editor. Storage is report._ai_prompts
 * (bot_id 0 = master/global ShredIntel base, else per-bot slave). These layers
 * are appended AFTER the fixed grounding in api/_lib/{prompts,voices}.ts and can
 * never override the schema/SQL/date/chart-safety rules.
 *
 * TODO(hardening): this sits behind the app's password gate; add real auth
 * (esp. for scope=master, which is GetSkiBots-internal) before any public embed.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPrompts, upsertPrompt } from './_lib/db.js'

export const maxDuration = 15

const PROMPT_MAX = 8000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const botId = Number(req.query.botId || 0)
      const { master, slave } = await getPrompts(botId)
      return res.status(200).json({ master, slave })
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const scope = String(body.scope || 'bot')
      const botId = scope === 'master' ? 0 : Number(body.botId || 0)
      if (scope !== 'master' && !botId) return res.status(400).json({ error: 'botId is required' })
      const prompt = String(body.prompt || '').slice(0, PROMPT_MAX)
      await upsertPrompt(botId, prompt)
      return res.status(200).json({ ok: true, scope, botId })
    }
    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('[api/prompt] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
