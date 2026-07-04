/**
 * Custom AI instructions — a free-text layer a resort can append to ShredIntel's
 * system prompt. It powers BOTH surfaces: it's sent to /api/ask (text search) and
 * /api/realtime-session (voice), where the server appends it after the fixed
 * grounding (schema + SQL safety stay locked). Stored per-bot.
 *
 * Demo-grade storage (localStorage). Production: move to Supabase per bot so it
 * persists across browsers and is server-authoritative (like Sendy's
 * accounts.ai_instructions).
 */

const key = (botId: number) => `shredintel_prompt_${botId}`

export const PROMPT_MAX = 2000

export function getPromptOverride(botId: number): string {
  try {
    return localStorage.getItem(key(botId)) || ''
  } catch {
    return ''
  }
}

export function setPromptOverride(botId: number, text: string): void {
  try {
    const trimmed = text.trim()
    if (trimmed) localStorage.setItem(key(botId), trimmed.slice(0, PROMPT_MAX))
    else localStorage.removeItem(key(botId))
  } catch {
    /* private mode — non-fatal */
  }
}
