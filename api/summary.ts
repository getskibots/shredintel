/**
 * POST /api/summary — ShredIntel EXECUTIVE SUMMARY.
 *   body: { botId, from, to, label? }
 *   → { title, period, generatedAt, cards: ReportCard[] }
 *
 * Unlike /api/ask (model writes ONE query per question), this runs a FIXED,
 * trusted battery of read-only metrics — volume, sentiment, resolution, revenue
 * at risk, top topics, conversion blockers, escalation, and the change vs the
 * prior equal-length period — then makes ONE LLM pass to write the plain-English
 * narrative. Every card is in the same shape the voice/ask reports use, so it
 * drills (tap a bar or ask by voice) and shares (download / email / copy) for free.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, runReadOnly, getBotTimezone } from './_lib/db.js'
import { chat } from './_lib/llm.js'

export const maxDuration = 30

type Row = Record<string, unknown>
interface Card {
  question: string
  answer: string
  vegaLite?: Record<string, unknown> | null
  rows: Row[]
  drill?: { dim: 'section' | 'pinchpoint' | 'sentiment'; value: string; label: string } | null
  window?: { from: string; to: string } | null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const n = (v: unknown) => Number(v ?? 0) || 0
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0)
const fmt = (x: number) => x.toLocaleString('en-US')

/** prior window of equal length, immediately before [from,to]. */
function priorWindow(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + 'T00:00:00Z'), t = new Date(to + 'T00:00:00Z')
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const pEnd = new Date(f.getTime() - 86400000)
  const pStart = new Date(pEnd.getTime() - (days - 1) * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(pStart), to: iso(pEnd) }
}

const hbar = (cat: string, measure = 'conversations') => ({
  mark: 'bar',
  encoding: {
    y: { field: cat, type: 'nominal', sort: '-x' },
    x: { field: measure, type: 'quantitative' },
  },
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const botId = Number(body.botId)
    if (!botId) return res.status(400).json({ error: 'botId is required' })
    const from = String(body.from ?? ''), to = String(body.to ?? '')
    if (!ISO.test(from) || !ISO.test(to) || from > to) return res.status(400).json({ error: 'valid from/to (YYYY-MM-DD) required' })
    const label = String(body.label ?? '').slice(0, 60) || `${from} to ${to}`
    const win = ` and day between '${from}' and '${to}'`
    const CI = `report.conversation_intel where bot_id = ${botId} and substantive`

    // resort name (public.bots is allow-listed for reads)
    let resort = 'your resort'
    try {
      const nm = await getPool().query<{ name: string }>('select name from public.bots where id = $1', [botId])
      if (nm.rows[0]?.name) resort = nm.rows[0].name.replace(/\s*-\s*ACTIVE$/i, '').trim()
    } catch { /* fall back */ }
    const tz = await getBotTimezone(botId)

    // ── the fixed battery (parallel) ───────────────────────────────────────
    const prior = priorWindow(from, to)
    const [vol, sent, reso, rev, sections, blockers, hand, changed, daily] = await Promise.all([
      runReadOnly<Row>(`select coalesce(sum(total_conversations),0)::int sessions, coalesce(sum(engaged_conversations),0)::int engaged from report.outcome_timeline where bot_id=${botId}${win}`),
      runReadOnly<Row>(`select sentiment, count(*)::int conversations from ${CI}${win} group by 1`),
      runReadOnly<Row>(`select resolution, count(*)::int conversations from ${CI}${win} group by 1`),
      runReadOnly<Row>(`select revenue, count(*)::int conversations from ${CI}${win} group by 1`),
      runReadOnly<Row>(`select section, count(*)::int conversations, count(*) filter (where sentiment='Negative')::int negative from ${CI}${win} and section is not null group by 1 order by 2 desc limit 6`),
      runReadOnly<Row>(`select pinchpoint, count(*)::int conversations from ${CI}${win} and pinchpoint is not null and pinchpoint<>'None' group by 1 order by 2 desc limit 6`),
      runReadOnly<Row>(`select count(*) filter (where handover in ('Clear Handover','Escalation Required'))::int clear, count(*)::int total from ${CI}${win}`),
      runReadOnly<Row>(`select count(*) filter (where day between '${from}' and '${to}')::int cur, count(*) filter (where day between '${prior.from}' and '${prior.to}')::int prev, count(*) filter (where sentiment='Negative' and day between '${from}' and '${to}')::int cur_neg, count(*) filter (where sentiment='Negative' and day between '${prior.from}' and '${prior.to}')::int prev_neg from report.conversation_intel where bot_id=${botId} and substantive and day between '${prior.from}' and '${to}'`),
      runReadOnly<Row>(`select day::text as day, sum(total_conversations)::int conversations from report.outcome_timeline where bot_id=${botId}${win} group by 1 order by 1`),
    ])

    const substantive = (reso as Row[]).reduce((a, r) => a + n(r.conversations), 0)
    if (substantive === 0) {
      return res.status(200).json({
        title: `Executive summary · ${resort}`, period: { from, to, label }, generatedAt: Date.now(),
        cards: [{ question: `Executive summary · ${resort} · ${label}`, answer: `No substantive guest conversations for ${resort} in this window (${label}). Try a wider date range.`, rows: [], vegaLite: null, drill: null, window: { from, to } }],
      })
    }

    const get = (rows: Row[], k: string, field: string) => n(rows.find((r) => String(r[field]) === k)?.conversations)
    const neg = get(sent as Row[], 'Negative', 'sentiment'), pos = get(sent as Row[], 'Positive', 'sentiment')
    const resolved = get(reso as Row[], 'Resolved', 'resolution')
    const unresolved = get(reso as Row[], 'Unresolved', 'resolution') + get(reso as Row[], 'Partial', 'resolution')
    const atRisk = get(rev as Row[], 'At Risk', 'revenue'), ready = get(rev as Row[], 'Ready to Book', 'revenue')
    const clearH = n((hand as Row[])[0]?.clear)
    const cur = n((changed as Row[])[0]?.cur), prev = n((changed as Row[])[0]?.prev)
    const curNeg = n((changed as Row[])[0]?.cur_neg), prevNeg = n((changed as Row[])[0]?.prev_neg)
    const volDelta = prev > 0 ? Math.round((100 * (cur - prev)) / prev) : null
    const topSection = (sections as Row[])[0]
    const topBlocker = (blockers as Row[])[0]

    // ── narrative (one LLM pass over the computed numbers) ─────────────────
    const facts = {
      resort, period: label, substantive, sessions: n((vol as Row[])[0]?.sessions), engaged: n((vol as Row[])[0]?.engaged),
      positive_pct: pct(pos, substantive), negative_pct: pct(neg, substantive),
      resolved_pct: pct(resolved, substantive), not_fully_resolved: unresolved,
      ready_to_book: ready, at_risk: atRisk, buying_intent_pct: pct(ready + atRisk, substantive),
      clear_escalations: clearH, top_topic: topSection ? `${topSection.section} (${n(topSection.conversations)})` : null,
      top_blocker: topBlocker ? `${topBlocker.pinchpoint} (${n(topBlocker.conversations)})` : null,
      volume_change_vs_prior_pct: volDelta,
    }
    let narrative = ''
    try {
      const j = await chat({
        system: 'You are ShredIntel, writing a short executive summary for a ski-resort manager. Plain, natural English, no jargon, no hyphens, not salesy. Use the exact numbers given. 3 to 4 sentences: what happened and the volume, how guests felt and whether things resolved, where the revenue opportunity or risk is, and what changed versus the prior period if notable. Lead with the single most important thing. Respond as JSON {"narrative":"..."}.',
        user: `Metrics: ${JSON.stringify(facts)}`, json: true, maxTokens: 400,
      })
      narrative = String(JSON.parse(j).narrative || '').trim()
    } catch { /* fall through to deterministic */ }
    if (!narrative) {
      narrative = `Over ${label}, ${resort} had about ${fmt(substantive)} substantive guest conversations. ${pct(pos, substantive)}% were positive and ${pct(neg, substantive)}% negative, and the assistant fully resolved about ${pct(resolved, substantive)}%. ${fmt(ready + atRisk)} showed buying intent, with ${fmt(atRisk)} at risk.${volDelta != null ? ` Volume ${volDelta >= 0 ? 'rose' : 'fell'} ${Math.abs(volDelta)}% versus the prior period.` : ''}`
    }

    const w = { from, to }
    const cards: Card[] = [
      { question: `Executive summary · ${resort} · ${label}`, answer: narrative, rows: [], vegaLite: null, drill: null, window: w },
      {
        question: 'Guest activity',
        answer: `About ${fmt(substantive)} substantive conversations${n((vol as Row[])[0]?.sessions) ? ` out of ${fmt(n((vol as Row[])[0]?.sessions))} total sessions` : ''}${volDelta != null ? `, ${volDelta >= 0 ? 'up' : 'down'} ${Math.abs(volDelta)}% from the prior period` : ''}.`,
        rows: daily as Row[], window: w, drill: null,
        vegaLite: (daily as Row[]).length > 1 ? { mark: 'line', encoding: { x: { field: 'day', type: 'temporal' }, y: { field: 'conversations', type: 'quantitative' } } } : null,
      },
      {
        question: 'How guests felt',
        answer: `${pct(pos, substantive)}% positive, ${pct(neg, substantive)}% negative. ${pos >= neg ? 'Guests were delighted more often than frustrated.' : 'Frustration ran ahead of delight this window.'}`,
        rows: sent as Row[], vegaLite: hbar('sentiment'), window: w,
        drill: neg > 0 ? { dim: 'sentiment', value: 'Negative', label: 'Frustrated guests' } : null,
      },
      {
        question: 'What guests came for',
        answer: topSection ? `The top topic was ${topSection.section}, ${fmt(n(topSection.conversations))} conversations${n(topSection.negative) ? ` (${pct(n(topSection.negative), n(topSection.conversations))}% frustrated)` : ''}. Tap any bar to read the actual conversations.` : 'No topic breakdown for this window.',
        rows: sections as Row[], vegaLite: hbar('section'), window: w,
        drill: topSection ? { dim: 'section', value: String(topSection.section), label: `${topSection.section} conversations` } : null,
      },
      {
        question: 'Revenue at risk',
        answer: `${fmt(ready + atRisk)} conversations showed buying intent (${pct(ready + atRisk, substantive)}% of the total). ${fmt(atRisk)} were at risk, a ready buyer who hit a snag, and ${fmt(ready)} looked ready to book.`,
        rows: (rev as Row[]).filter((r) => ['At Risk', 'Ready to Book', 'Browsing'].includes(String(r.revenue))),
        vegaLite: hbar('revenue'), window: w, drill: null,
      },
    ]
    if ((blockers as Row[]).length) {
      cards.push({
        question: 'Where guests get stuck',
        answer: topBlocker ? `The biggest conversion blocker was ${topBlocker.pinchpoint}, ${fmt(n(topBlocker.conversations))} conversations. ${fmt(clearH)} conversations escalated to a person. Tap a bar to read them.` : `${fmt(clearH)} conversations escalated to a person.`,
        rows: blockers as Row[], vegaLite: hbar('pinchpoint'), window: w,
        drill: topBlocker ? { dim: 'pinchpoint', value: String(topBlocker.pinchpoint), label: `${topBlocker.pinchpoint} blockers` } : null,
      })
    }
    if (volDelta != null) {
      const negCurPct = pct(curNeg, cur), negPrevPct = pct(prevNeg, prev)
      cards.push({
        question: 'What changed',
        answer: `Versus the prior ${label.toLowerCase().includes('day') ? 'period' : 'equal period'}, volume ${volDelta >= 0 ? 'rose' : 'fell'} ${Math.abs(volDelta)}% (${fmt(prev)} to ${fmt(cur)}) and the frustrated share went from ${negPrevPct}% to ${negCurPct}%.`,
        rows: [{ period: 'Prior', conversations: prev }, { period: 'Current', conversations: cur }],
        vegaLite: hbar('period'), window: w, drill: null,
      })
    }

    return res.status(200).json({ title: `Executive summary · ${resort}`, period: { from, to, label, tz }, generatedAt: Date.now(), cards })
  } catch (e) {
    console.error('[api/summary] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
