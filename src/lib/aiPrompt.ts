/**
 * Client for the two editable AI-instruction layers, stored in Supabase
 * (report._ai_prompts) and served by /api/prompt:
 *   - MASTER (global): the ShredIntel base — persona + report methodology.
 *     GetSkiBots-controlled; shared by every bot.
 *   - SLAVE (per-bot): resort-specific guidance for one bot.
 * The server appends both AFTER the fixed grounding (schema + SQL/date/chart
 * safety stay locked) for BOTH text search (/api/ask) and voice
 * (/api/realtime-session), so an edit here changes both surfaces.
 *
 * MASTER is GSB product IP: the server only returns/accepts it with a valid
 * GSB admin key. We hold that key in localStorage (GSB machines only) and send
 * it as `x-gsb-admin-key`; a resort/partner never has it, so they only ever see
 * and edit their own slave.
 */

export type PromptScope = 'master' | 'bot'

export interface Prompts {
  master: string
  slave: string
}

export const PROMPT_MAX = 8000

// ── GSB admin key (localStorage) — unlocks master read/write, GSB machines only ──
const ADMIN_KEY_LS = 'gsb_admin_key'
export function getAdminKey(): string {
  try { return localStorage.getItem(ADMIN_KEY_LS) || '' } catch { return '' }
}
export function hasAdminKey(): boolean {
  return getAdminKey().length > 0
}
export function setAdminKey(key: string): void {
  try {
    const k = key.trim()
    if (k) localStorage.setItem(ADMIN_KEY_LS, k)
    else localStorage.removeItem(ADMIN_KEY_LS)
  } catch { /* localStorage unavailable — no-op */ }
}
function adminHeaders(): Record<string, string> {
  const k = getAdminKey()
  return k ? { 'x-gsb-admin-key': k } : {}
}

/** Read both layers for a bot. Never throws — empty strings on failure.
 *  `master` comes back empty unless a valid GSB admin key is present. */
export async function fetchPrompts(botId: number): Promise<Prompts> {
  try {
    const r = await fetch(`/api/prompt?botId=${botId}`, { headers: adminHeaders() })
    if (!r.ok) return { master: '', slave: '' }
    const d = await r.json()
    return { master: String(d.master || ''), slave: String(d.slave || '') }
  } catch {
    return { master: '', slave: '' }
  }
}

/** Persist one layer. scope 'master' ignores botId (writes the global row) and
 *  requires the GSB admin key; returns false (403) without it. */
export async function savePrompt(scope: PromptScope, botId: number, prompt: string): Promise<boolean> {
  try {
    const r = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ scope, botId, prompt: prompt.slice(0, PROMPT_MAX) }),
    })
    return r.ok
  } catch {
    return false
  }
}
