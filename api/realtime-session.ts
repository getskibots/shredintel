/**
 * POST /api/realtime-session  — mints a short-lived OpenAI Realtime client token
 * so the browser can open a WebRTC speech-to-speech session without ever seeing
 * the real API key. Configured with the selected persona's voice (ash/alloy/
 * cedar) + instructions + the query_shredintel tool (the browser executes the
 * tool by calling /api/ask, bot-scoped client-side).
 *   body: { voiceId, botId }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { realtimeInstruction, openaiVoiceFor } from './_lib/voices.js'
import { getPrompts, getBotTimezone } from './_lib/db.js'

export const maxDuration = 15

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const voiceId = String(body.voiceId ?? req.query.voiceId ?? 'autumn')
    // Same two editable layers the text AI uses (report._ai_prompts).
    const botId = Number(body.botId ?? req.query.botId ?? 0)
    const { master, slave } = await getPrompts(botId)
    // Resort-local today + tz so the voice AI can resolve dates ("October 2025")
    // and pass a concrete window to the drill.
    const tz = await getBotTimezone(botId)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    const KEY = (process.env.OPENAI_API_KEY || '').trim()
    if (!KEY) return res.status(500).json({ error: 'OPENAI_API_KEY missing' })

    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions: realtimeInstruction(voiceId, master, slave, { tz, today }),
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
            {
              type: 'function',
              name: 'show_conversations',
              description:
                "Open the actual guest conversations behind a slice of the data on the manager's screen so they can read the real transcripts. Call this when they ask to 'see', 'show me', 'read', 'dive into', 'pull up', or 'zoom in on' the conversations for a topic, blocker, or sentiment.",
              parameters: {
                type: 'object',
                properties: {
                  dimension: {
                    type: 'string',
                    enum: ['section', 'pinchpoint', 'sentiment'],
                    description:
                      'section = knowledge topic (Tickets, Lessons, Rentals, Lodging, Season Passes …); pinchpoint = conversion blocker (Login, Password reset, Account access, Order lookup, Payment, Checkout, Booking change, Confirmation, Waiver, Credit, Voucher); sentiment = Positive, Neutral, or Negative',
                  },
                  value: { type: 'string', description: 'The exact label to filter to, e.g. "Checkout", "Lessons", "Negative".' },
                  label: { type: 'string', description: 'Short header for the screen, e.g. "Checkout blockers".' },
                  from: { type: 'string', description: 'Optional start date YYYY-MM-DD (resort-local). ONLY when the manager scopes to a date/period — resolve it from today, e.g. "October 2025" → 2025-10-01, "last weekend" → that Sat. Omit to use the dashboard\'s current range.' },
                  to: { type: 'string', description: 'Optional inclusive end date YYYY-MM-DD (resort-local), e.g. "October 2025" → 2025-10-31. Omit with `from` to use the dashboard\'s range.' },
                },
                required: ['dimension', 'value'],
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
