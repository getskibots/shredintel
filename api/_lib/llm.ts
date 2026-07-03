/**
 * Provider-agnostic LLM adapter. One interface, two backends (OpenAI +
 * Anthropic), switchable by env so we can start on OpenAI and drop Claude in
 * with zero refactor — or route/A-B them later.
 *
 * Env:
 *   LLM_PROVIDER      'openai' (default) | 'anthropic'
 *   OPENAI_API_KEY    + optional OPENAI_MODEL   (default gpt-4o-mini)
 *   ANTHROPIC_API_KEY + optional ANTHROPIC_MODEL (default claude-haiku-4-5-20251001)
 */
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export type Provider = 'openai' | 'anthropic'

export function activeProvider(): Provider {
  return process.env.LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'
}

interface ChatOpts {
  system: string
  user: string
  json?: boolean
  maxTokens?: number
  temperature?: number
}

export async function chat(opts: ChatOpts, provider: Provider = activeProvider()): Promise<string> {
  const { system, user, json = false, maxTokens = 800, temperature = 0 } = opts

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') })
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: json ? `${system}\n\nRespond with a single valid JSON object only — no markdown, no prose.` : system,
      messages: [{ role: 'user', content: user }],
    })
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  }

  const client = new OpenAI({ apiKey: required('OPENAI_API_KEY') })
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    response_format: json ? { type: 'json_object' } : undefined,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return (res.choices[0]?.message?.content || '').trim()
}

function required(key: string): string {
  // Trim — a stray space/newline from pasting the key into a dashboard makes
  // the Authorization header invalid, which the SDK reports as "Connection error".
  const v = process.env[key]?.trim()
  if (!v) throw new Error(`${key} is not set`)
  return v
}
