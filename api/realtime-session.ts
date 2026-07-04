/**
 * POST /api/realtime-session  — mints a short-lived OpenAI Realtime client token
 * so the browser can open a WebRTC speech-to-speech session without ever seeing
 * the real API key. Configured with the selected persona's voice (ash/alloy/
 * cedar) + instructions + the query_shredintel tool (the browser executes the
 * tool by calling /api/ask, bot-scoped client-side).
 *   body: { voiceId }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { realtimeInstruction, openaiVoiceFor } from './_lib/voices.js'

export const maxDuration = 15

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const voiceId = String(body.voiceId ?? req.query.voiceId ?? 'old-man-winter')
    const KEY = (process.env.OPENAI_API_KEY || '').trim()
    if (!KEY) return res.status(500).json({ error: 'OPENAI_API_KEY missing' })

    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions: realtimeInstruction(voiceId),
          audio: { output: { voice: openaiVoiceFor(voiceId) } },
          tools: [
            {
              type: 'function',
              name: 'query_shredintel',
              description:
                "Answer a question about this resort's chat data (top topics, sentiment, conversion blockers, volume, knowledge sections). Returns a short answer grounded in real numbers.",
              parameters: {
                type: 'object',
                properties: { question: { type: 'string', description: "The manager's question, verbatim" } },
                required: ['question'],
              },
            },
          ],
        },
      }),
    })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: j?.error || j })
    return res.status(200).json({ value: j.value, expires_at: j.expires_at, model: 'gpt-realtime', voice: openaiVoiceFor(voiceId) })
  } catch (e) {
    console.error('[api/realtime-session] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
