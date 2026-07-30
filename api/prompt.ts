/**
 * GET  /api/prompt?botId=43  → { master, slave }  (the two editable AI layers)
 * POST /api/prompt           → { ok }  body: { scope: 'master'|'bot', botId, prompt }
 *
 * Backs the in-app AI-instructions editor. Storage is report._ai_prompts
 * (bot_id 0 = master/global ShredIntel base, else per-bot slave). These layers
 * are appended AFTER the fixed grounding in api/_lib/{prompts,voices}.ts and can
 * never override the schema/SQL/date/chart-safety rules.
 *
 * AUTH: the MASTER layer (bot 0) is GetSkiBots product IP shared by every bot —
 * a resort must never read or edit it. It's gated behind GSB_ADMIN_KEY: the
 * caller sends `x-gsb-admin-key`, and only a match unlocks the master (GET
 * returns it; POST scope=master accepts it). Per-bot (slave) edits stay open.
 * Secure-by-default: if GSB_ADMIN_KEY is unset, the master is locked for
 * everyone (set it in the env + unlock in the editor to edit the master).
 * NOTE: the AI runtime reads the master server-side via getPrompts() in
 * api/_lib/*, NOT this HTTP route, so gating the editor never affects the bots.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPrompts, upsertPrompt, getPromptHistory } from './_lib/db.js'

export const maxDuration = 15

const PROMPT_MAX = 8000
const ADMIN_KEY = (process.env.GSB_ADMIN_KEY || '').trim()
/** GSB-internal caller? Only true when a key is configured AND it matches. */
const isGsbAdmin = (req: VercelRequest): boolean =>
  ADMIN_KEY.length > 0 && String(req.headers['x-gsb-admin-key'] || '') === ADMIN_KEY

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      // GSB-only: version history for a layer (?history=<botId>; 0 = the fleet master).
      if (req.query.history !== undefined) {
        if (!isGsbAdmin(req)) return res.status(403).json({ error: 'admin only' })
        const historyBotId = Number(req.query.history || 0)
        return res.status(200).json({ history: await getPromptHistory(historyBotId) })
      }
      const botId = Number(req.query.botId || 0)
      const { master, slave } = await getPrompts(botId)
      // Master (product IP) only goes back to a GSB-authed caller.
      return res.status(200).json({ master: isGsbAdmin(req) ? master : '', slave })
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const scope = String(body.scope || 'bot')
      // Editing the fleet-wide master requires the GSB admin key.
      if (scope === 'master' && !isGsbAdmin(req))
        return res.status(403).json({ error: 'master edits require GSB admin' })
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
