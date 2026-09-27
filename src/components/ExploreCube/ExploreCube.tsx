import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../shared'
import { fetchIntelPivot, type PivotCell } from '../../data/queries'
import { ConversationExplorer } from '../ConversationExplorer/ConversationExplorer'
import type { DrillPayload } from '../../lib/drill'
import { formatNumber } from '../../lib/formatters'

/**
 * ExploreCube — the "Rubik's cube": pick any two angles of the conversation data,
 * see the cross-tab as a heatmap (cell shaded by how frustrated), click a cell to
 * read exactly those conversations. One component, two channels:
 *   source="chat"  → report.intel_pivot over conversation_time (page/section rich)
 *   source="voice" → report.voice_pivot over call_drill (hour + escalation/voicemail)
 * Presets turn the common questions into one click; the measure toggle re-reads the
 * same cells as volume, share-frustrated, or count-frustrated (all from one fetch).
 */
const DIMS_CHAT: { value: string; label: string }[] = [
  { value: 'section', label: 'Topic (section)' },
  { value: 'page', label: 'Page' },
  { value: 'sentiment', label: 'Sentiment' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'revenue', label: 'Buying intent' },
  { value: 'pinchpoint', label: 'Conversion blocker' },
  { value: 'urgency', label: 'Urgency' },
  { value: 'handover', label: 'Handover need' },
  { value: 'category', label: 'Category' },
  { value: 'flavor', label: 'Vibe' },
  { value: 'funnel_stage', label: 'Funnel stage' },
  { value: 'hour', label: 'Hour of day' },
  { value: 'dow', label: 'Day of week' },
  { value: 'city', label: 'City' },
]
const DIMS_VOICE: { value: string; label: string }[] = [
  { value: 'section', label: 'Topic (section)' },
  { value: 'sentiment', label: 'Sentiment' },
  { value: 'transferred', label: 'Escalation' },
  { value: 'voicemail', label: 'Reached vs voicemail' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'revenue', label: 'Buying intent' },
  { value: 'urgency', label: 'Urgency' },
  { value: 'handover', label: 'Handover need' },
  { value: 'pinchpoint', label: 'Conversion blocker' },
  { value: 'category', label: 'Category' },
  { value: 'flavor', label: 'Vibe' },
  { value: 'hour', label: 'Hour of day' },
  { value: 'city', label: 'Caller city' },
]

// cube dim name → the DrillPayload field it filters on (mostly identical; hour→hour_local).
const CUBE_TO_PAYLOAD: Record<string, keyof DrillPayload> = {
  section: 'section', page: 'page', sentiment: 'sentiment', resolution: 'resolution',
  revenue: 'revenue', pinchpoint: 'pinchpoint', urgency: 'urgency', handover: 'handover',
  category: 'category', flavor: 'flavor', funnel_stage: 'funnel_stage',
  hour: 'hour_local', dow: 'dow', city: 'city',
  transferred: 'transferred', voicemail: 'voicemail',
}

type Measure = 'count' | 'negpct' | 'negcount'
const MEASURES: { value: Measure; label: string }[] = [
  { value: 'count', label: 'Volume' },
  { value: 'negpct', label: '% frustrated' },
  { value: 'negcount', label: '# frustrated' },
]

type Preset = { label: string; a: string; b: string; m: Measure }
// One-click views built from the questions people actually ask the cube. Each is just
// (row, column, measure) — the same controls, pre-set. Kept per-channel so voice offers
// escalation/voicemail and chat offers page/funnel.
const PRESETS_CHAT: Preset[] = [
  { label: 'Ready to book × what they asked', a: 'revenue', b: 'section', m: 'count' },
  { label: 'Frustration by page × hour', a: 'page', b: 'hour', m: 'negpct' },
  { label: 'Blockers × page', a: 'pinchpoint', b: 'page', m: 'negcount' },
  { label: 'Resolution × buying intent', a: 'resolution', b: 'revenue', m: 'count' },
]
const PRESETS_VOICE: Preset[] = [
  { label: 'Escalation × voicemail', a: 'transferred', b: 'voicemail', m: 'count' },
  { label: 'Ready to book × resolution', a: 'revenue', b: 'resolution', m: 'count' },
  { label: 'Topic × escalation', a: 'section', b: 'transferred', m: 'negcount' },
  { label: 'Frustration by topic × hour', a: 'section', b: 'hour', m: 'negpct' },
]

function shortVal(v: string): string {
  if (v === '(none)' || v === '') return '—'
  if (v.includes('/')) { const p = v.replace(/^[^/]*/, ''); return (p || v).length > 22 ? (p || v).slice(0, 22) + '…' : (p || v) }
  return v.length > 20 ? v.slice(0, 20) + '…' : v
}

export function ExploreCube({
  botId,
  range,
  source = 'chat',
  className,
}: {
  botId: number
  range: { from: string; to: string; label?: string }
  source?: 'chat' | 'voice'
  className?: string
}) {
  const isVoice = source === 'voice'
  const DIMS = isVoice ? DIMS_VOICE : DIMS_CHAT
  const PRESETS = isVoice ? PRESETS_VOICE : PRESETS_CHAT
  const noun = isVoice ? 'calls' : 'chats'
  const labelFor = (v: string) => DIMS.find((d) => d.value === v)?.label ?? v

  const [dimA, setDimA] = useState('section')
  const [dimB, setDimB] = useState(isVoice ? 'hour' : 'page')
  const [measure, setMeasure] = useState<Measure>('count')
  const [cells, setCells] = useState<PivotCell[] | null>(null)
  const [drill, setDrill] = useState<DrillPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    setCells(null)
    fetchIntelPivot(botId, range.from, range.to, dimA, dimB === dimA ? null : dimB, isVoice ? 'voice_pivot' : 'intel_pivot')
      .then((c) => { if (!cancelled) setCells(c) })
    return () => { cancelled = true }
  }, [botId, range.from, range.to, dimA, dimB, isVoice])

  const grid = useMemo(() => {
    if (!cells) return null
    const aTot = new Map<string, number>()
    const bTot = new Map<string, number>()
    const m = new Map<string, PivotCell>()
    for (const c of cells) {
      aTot.set(c.a, (aTot.get(c.a) ?? 0) + c.conversations)
      bTot.set(c.b, (bTot.get(c.b) ?? 0) + c.conversations)
      m.set(c.a + '\u0000' + c.b, c)
    }
    const rows = [...aTot.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map((e) => e[0])
    const cols = [...bTot.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map((e) => e[0])
    return { rows, cols, get: (a: string, b: string) => m.get(a + '\u0000' + b) ?? null }
  }, [cells])

  const openCell = (a: string, b: string) => {
    const extra: Record<string, string> = {}
    if (a !== '(none)' && a !== '') extra[CUBE_TO_PAYLOAD[dimA]] = a
    if (dimB !== dimA && b !== '(none)' && b !== '') extra[CUBE_TO_PAYLOAD[dimB]] = b
    setDrill({ botId, from: range.from, to: range.to, ...extra } as DrillPayload)
  }

  const applyPreset = (p: Preset) => { setDimA(p.a); setDimB(p.b); setMeasure(p.m) }
  const activePreset = PRESETS.find((p) => p.a === dimA && p.b === dimB && p.m === measure)

  const oneDim = dimB === dimA
  const measureLabel = MEASURES.find((x) => x.value === measure)?.label ?? ''

  return (
    <Panel
      className={className}
      eyebrow="Explore"
      title="Pivot cube"
      description={`Cross any two angles of your ${noun}. Shading = share frustrated; the number is ${measureLabel.toLowerCase()}. Click a cell to read exactly those conversations.`}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => applyPreset(p)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              activePreset?.label === p.label
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Rows</span>
        <select value={dimA} onChange={(e) => setDimA(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700">
          {DIMS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <span className="px-1 text-slate-400">×</span>
        <span className="text-slate-500">Columns</span>
        <select value={dimB} onChange={(e) => setDimB(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700">
          {DIMS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <span className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs">
          {MEASURES.map((x) => (
            <button key={x.value} type="button" onClick={() => setMeasure(x.value)}
              className={`px-2.5 py-1 font-medium transition ${
                measure === x.value ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}>
              {x.label}
            </button>
          ))}
        </span>
      </div>

      {!grid ? (
        <div className="py-14 text-center text-sm text-slate-400">Crunching the cube…</div>
      ) : grid.rows.length === 0 ? (
        <div className="py-14 text-center text-sm text-slate-400">No {noun} for this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            {!oneDim && (
              <thead>
                <tr>
                  <th className="text-right text-[10px] font-medium uppercase tracking-wider text-slate-400">{labelFor(dimA)} ↓ / {labelFor(dimB)} →</th>
                  {grid.cols.map((b) => (
                    <th key={b} className="max-w-[68px] truncate px-1 pb-1 text-left font-medium text-slate-500" title={b}>{shortVal(b)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {grid.rows.map((a) => (
                <tr key={a}>
                  <td className="max-w-[150px] truncate py-1 pr-2 text-right font-medium text-slate-600" title={a}>{shortVal(a)}</td>
                  {grid.cols.map((b) => {
                    const c = grid.get(a, b)
                    if (!c || c.conversations === 0) return <td key={b}><div className="h-10 w-16 rounded bg-slate-50" /></td>
                    const negPct = Math.round((100 * c.negative) / c.conversations)
                    const opacity = Math.min(0.88, (c.negative / c.conversations) * 2.2)
                    const dark = opacity > 0.5
                    const primary = measure === 'negpct' ? `${negPct}%` : measure === 'negcount' ? formatNumber(c.negative) : formatNumber(c.conversations)
                    // secondary context line: for volume show frustration %, for the frustration
                    // measures show how many of how many so a big % on a tiny cell is obvious.
                    const secondary = measure === 'count'
                      ? (negPct >= 15 ? `${negPct}%` : null)
                      : `of ${formatNumber(c.conversations)}`
                    return (
                      <td key={b} className="p-0">
                        <button type="button" onClick={() => openCell(a, b)}
                          title={`${shortVal(a)} × ${shortVal(b)}\n${formatNumber(c.conversations)} ${noun} · ${formatNumber(c.negative)} frustrated (${negPct}%) — click to read`}
                          className="flex h-10 w-16 flex-col items-center justify-center rounded transition hover:ring-2 hover:ring-slate-400"
                          style={{ background: `rgba(225, 29, 72, ${opacity})` }}>
                          <span className={`font-semibold tabular-nums ${dark ? 'text-white' : 'text-slate-700'}`}>{primary}</span>
                          {secondary && <span className={`text-[9px] leading-none ${dark ? 'text-white/85' : measure === 'count' ? 'text-rose-600' : 'text-slate-500'}`}>{secondary}</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-400">
            Number = {measureLabel.toLowerCase()} · shading = share frustrated (negative sentiment) · top {grid.rows.length}×{grid.cols.length} by volume · click a cell to read those {noun}.
          </p>
        </div>
      )}

      {drill && (
        <ConversationExplorer botId={botId} source={source} payload={drill} range={{ from: range.from, to: range.to }} onClose={() => setDrill(null)} />
      )}
    </Panel>
  )
}
