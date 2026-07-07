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
const MAX_THREADS = 40      // simultaneous guests per run
const MAX_TURNS = 8         // questions per guest thread
const MAX_QUESTIONS = 100   // flat back-compat cap
// Hard ceiling on how many headless pages run at once. Each is ~150-250 MB, so a
// 2 GB droplet safely handles ~3. Raise via MAX_CONCURRENCY env on a bigger box.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.MAX_CONCURRENCY) || 3)

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

  // Accept `threads` (multi-turn: string[][], each = one guest) OR `questions`
  // (flat: string[], each becomes a 1-turn thread — keeps the existing modal working).
  const flat = !Array.isArray(b.threads) && Array.isArray(b.questions)
  let threads
  if (Array.isArray(b.threads)) {
    threads = b.threads
      .map((t) => (Array.isArray(t) ? t : []).map((q) => String(q).trim()).filter(Boolean).slice(0, MAX_TURNS))
      .filter((t) => t.length)
      .slice(0, MAX_THREADS)
  } else if (Array.isArray(b.questions)) {
    threads = b.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, MAX_QUESTIONS).map((q) => [q])
  } else {
    threads = []
  }
  // Each unit of concurrency is a separate simultaneous guest conversation.
  // RAM on the droplet is the real ceiling (~150 MB per headless page).
  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(b.concurrency) || MAX_CONCURRENCY))

  let host = ''
  try { host = new URL(widgetUrl).host } catch { /* invalid */ }
  if (host !== ALLOWED_HOST) return res.status(400).json({ error: `widgetUrl must be on ${ALLOWED_HOST}` })
  if (!threads.length) return res.status(400).json({ error: 'threads[][] or questions[] required' })

  const t0 = Date.now()
  try {
    const threadResults = await runProbe({ widgetUrl, threads, concurrency })
    const ms = Date.now() - t0
    if (flat) {
      // Back-compat: one flat result per question for the existing modal.
      const results = threadResults.flatMap((r) => r.turns.map((t) => ({ q: t.q, a: t.a, ms: t.ms, error: t.err })))
      return res.json({ results, ms, count: results.length })
    }
    return res.json({ results: threadResults, ms, count: threadResults.length })
  } catch (e) {
    console.error('[probe] failed:', e)
    res.status(500).json({ error: (e && e.message) || 'probe failed' })
  }
})

app.listen(PORT, () => console.log(`gsb-probe-service listening on :${PORT}`))
