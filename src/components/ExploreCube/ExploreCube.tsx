import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../shared'
import { fetchIntelPivot, type PivotCell } from '../../data/queries'
import { ConversationExplorer } from '../ConversationExplorer/ConversationExplorer'
import type { DrillPayload } from '../../lib/drill'
import { formatNumber } from '../../lib/formatters'

/**
 * ExploreCube — the "Rubik's cube": pick any two angles of the conversation data,
 * see the cross-tab as a heatmap (cell = conversations, shaded by how frustrated),
 * click a cell to read exactly those chats. Powered by the report.intel_pivot RPC
 * (anon-safe cross-tab over report.conversation_time) + the shared drill.
 */
const DIMS: { value: string; label: string }[] = [
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

// cube dim name → the DrillPayload field it filters on (mostly identical; hour→hour_local).
const CUBE_TO_PAYLOAD: Record<string, keyof DrillPayload> = {
  section: 'section', page: 'page', sentiment: 'sentiment', resolution: 'resolution',
  revenue: 'revenue', pinchpoint: 'pinchpoint', urgency: 'urgency', handover: 'handover',
  category: 'category', flavor: 'flavor', funnel_stage: 'funnel_stage',
  hour: 'hour_local', dow: 'dow', city: 'city',
}

const labelFor = (v: string) => DIMS.find((d) => d.value === v)?.label ?? v

function shortVal(v: string): string {
  if (v === '(none)' || v === '') return '—'
  if (v.includes('/')) { const p = v.replace(/^[^/]*/, ''); return (p || v).length > 22 ? (p || v).slice(0, 22) + '…' : (p || v) }
  return v.length > 20 ? v.slice(0, 20) + '…' : v
}

export function ExploreCube({
  botId,
  range,
  className,
}: {
  botId: number
  range: { from: string; to: string; label?: string }
  className?: string
}) {
  const [dimA, setDimA] = useState('section')
  const [dimB, setDimB] = useState('page')
  const [cells, setCells] = useState<PivotCell[] | null>(null)
  const [drill, setDrill] = useState<DrillPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    setCells(null)
    fetchIntelPivot(botId, range.from, range.to, dimA, dimB === dimA ? null : dimB)
      .then((c) => { if (!cancelled) setCells(c) })
    return () => { cancelled = true }
  }, [botId, range.from, range.to, dimA, dimB])

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

  const oneDim = dimB === dimA

  return (
    <Panel
      className={className}
      eyebrow="Explore"
      title="Pivot cube"
      description="Cross any two angles of your conversations. Each cell is the number of chats; redder means more frustrated. Click a cell to read exactly those conversations."
    >
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
      </div>

      {!grid ? (
        <div className="py-14 text-center text-sm text-slate-400">Crunching the cube…</div>
      ) : grid.rows.length === 0 ? (
        <div className="py-14 text-center text-sm text-slate-400">No conversations for this range.</div>
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
                    return (
                      <td key={b} className="p-0">
                        <button type="button" onClick={() => openCell(a, b)}
                          title={`${shortVal(a)} × ${shortVal(b)}\n${formatNumber(c.conversations)} chats · ${negPct}% frustrated — click to read`}
                          className="flex h-10 w-16 flex-col items-center justify-center rounded transition hover:ring-2 hover:ring-slate-400"
                          style={{ background: `rgba(225, 29, 72, ${opacity})` }}>
                          <span className={`font-semibold tabular-nums ${dark ? 'text-white' : 'text-slate-700'}`}>{formatNumber(c.conversations)}</span>
                          {negPct >= 15 && <span className={`text-[9px] leading-none ${dark ? 'text-white/85' : 'text-rose-600'}`}>{negPct}%</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-400">
            Cell = conversations · shading = share frustrated (negative sentiment) · top {grid.rows.length}×{grid.cols.length} by volume · click a cell to read those chats.
          </p>
        </div>
      )}

      {drill && (
        <ConversationExplorer botId={botId} source="chat" payload={drill} range={{ from: range.from, to: range.to }} onClose={() => setDrill(null)} />
      )}
    </Panel>
  )
}
