/**
 * Client for the two editable AI-instruction layers, stored in Supabase
 * (report._ai_prompts) and served by /api/prompt:
 *   - MASTER (global): the ShredIntel base — persona + report methodology.
 *     GetSkiBots-controlled; shared by every bot.
 *   - SLAVE (per-bot): resort-specific guidance for one bot.
 * The server appends both AFTER the fixed grounding (schema + SQL/date/chart
 * safety stay locked) for BOTH text search (/api/ask) and voice
 * (/api/realtime-session), so an edit here changes both surfaces.
 */

export type PromptScope = 'master' | 'bot'

export interface Prompts {
  master: string
  slave: string
}

export const PROMPT_MAX = 4000

/** Read both layers for a bot. Never throws — empty strings on failure. */
export async function fetchPrompts(botId: number): Promise<Prompts> {
  try {
    const r = await fetch(`/api/prompt?botId=${botId}`)
    if (!r.ok) return { master: '', slave: '' }
    const d = await r.json()
    return { master: String(d.master || ''), slave: String(d.slave || '') }
  } catch {
    return { master: '', slave: '' }
  }
}

/** Persist one layer. scope 'master' ignores botId (writes the global row). */
export async function savePrompt(scope: PromptScope, botId: number, prompt: string): Promise<boolean> {
  try {
    const r = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, botId, prompt: prompt.slice(0, PROMPT_MAX) }),
    })
    return r.ok
  } catch {
    return false
  }
}
