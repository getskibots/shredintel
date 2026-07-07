/**
 * POST /api/probe — thin proxy to the "Ahhh FAQ It" probe service (a droplet
 * running headless Chromium). The browser only ever talks to this same-origin
 * endpoint; the droplet's address + token stay server-side (env), so the widget
 * probe runs entirely on a server — never in the operator's browser.
 *
 * Body: { widgetUrl, questions: string[], concurrency? } → forwarded verbatim.
 * Returns the droplet's JSON ({ results: [{ q, a, ms, error? }], ms }).
 *
 * Env:
 *   PROBE_SERVICE_URL   e.g. http://165.232.x.x:8080  (droplet, no trailing slash)
 *   PROBE_SERVICE_TOKEN shared bearer secret the droplet checks
 *
 * v1 forwards synchronously (bounded batch fits maxDuration). A background-job
 * variant (start → poll) lands when full 100-question audits are needed.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 300

const ALLOWED_HOST = 'bots.getskitickets.com'
const MAX_QUESTIONS = 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const base = process.env.PROBE_SERVICE_URL
  const token = process.env.PROBE_SERVICE_TOKEN
  if (!base || !token) {
    return res.status(503).json({
      error: 'Probe service not configured. Set PROBE_SERVICE_URL and PROBE_SERVICE_TOKEN.',
    })
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {}
  const widgetUrl = String(body.widgetUrl || '')
  const questions: string[] = Array.isArray(body.questions)
    ? body.questions.map((q: unknown) => String(q)).filter(Boolean).slice(0, MAX_QUESTIONS)
    : []
  const concurrency = Math.max(1, Math.min(6, Number(body.concurrency) || 4))

  // Guard here too (defense in depth) so the droplet only ever probes our own
  // widgets, even if its own check were ever relaxed.
  let host = ''
  try { host = new URL(widgetUrl).host } catch { /* invalid */ }
  if (host !== ALLOWED_HOST) return res.status(400).json({ error: `widgetUrl must be on ${ALLOWED_HOST}` })
  if (!questions.length) return res.status(400).json({ error: 'questions[] required' })

  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ widgetUrl, questions, concurrency }),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (e) {
    console.error('[api/probe] proxy failed:', e)
    return res.status(502).json({ error: 'Could not reach the probe service.' })
  }
}
