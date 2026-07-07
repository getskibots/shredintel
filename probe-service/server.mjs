import express from 'express'
import { runProbe, ALLOWED_HOST } from './probe.mjs'

/**
 * Ahhh FAQ It probe service. One endpoint: POST /probe. Bearer-token auth
 * (shared secret with the ShredIntel proxy). Only ever probes our own widgets
 * (bots.getskitickets.com). Meant to run on a small droplet behind ShredIntel's
 * /api/probe — the browser never talks to it directly.
 */

const PORT = Number(process.env.PORT) || 8080
const TOKEN = process.env.PROBE_TOKEN
const MAX_QUESTIONS = 100

const app = express()
app.use(express.json({ limit: '256kb' }))

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.post('/probe', async (req, res) => {
  if (!TOKEN) return res.status(500).json({ error: 'PROBE_TOKEN is not set on the service' })
  if ((req.headers.authorization || '') !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const b = req.body || {}
  const widgetUrl = String(b.widgetUrl || '')
  const questions = Array.isArray(b.questions)
    ? b.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, MAX_QUESTIONS)
    : []
  // Each unit of concurrency is a separate simultaneous conversation ("person").
  // RAM on the droplet is the real ceiling (~150 MB per headless page).
  const concurrency = Math.max(1, Math.min(16, Number(b.concurrency) || 4))

  let host = ''
  try { host = new URL(widgetUrl).host } catch { /* invalid */ }
  if (host !== ALLOWED_HOST) return res.status(400).json({ error: `widgetUrl must be on ${ALLOWED_HOST}` })
  if (!questions.length) return res.status(400).json({ error: 'questions[] required' })

  const t0 = Date.now()
  try {
    const results = await runProbe({ widgetUrl, questions, concurrency })
    res.json({ results, ms: Date.now() - t0, count: results.length })
  } catch (e) {
    console.error('[probe] failed:', e)
    res.status(500).json({ error: (e && e.message) || 'probe failed' })
  }
})

app.listen(PORT, () => console.log(`gsb-probe-service listening on :${PORT}`))
