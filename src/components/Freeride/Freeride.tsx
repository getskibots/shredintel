import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList,
} from 'recharts'
import { Loader2, ArrowUp, Sparkles } from 'lucide-react'
import { resolveSelection, formatRangeHuman } from '../../lib/period'

/**
 * FREERIDE — the conversational, spinnable data explorer (Phase 1: one living
 * chart). You ask a question, the AI picks a cube slice (never SQL), the engine
 * runs it, and the chart draws. Ask a follow-up and it spins in place: the same
 * chart morphs to the new slice. Every chart is captioned with its exact
 * definition, so the number is always fact-checkable.
 */

interface SpinSpec {
  source: string
  from: string
  to: string
  dims: { key: string; label: string }[]
  measure: { key: string; label: string; format: 'int' | 'pct' | 'sec' }
  filters: { key: string; label: string; value: string }[]
}
interface SpinResult {
  spec: SpinSpec
  rows: Record<string, string | number>[]
  chartType: 'bar' | 'line' | 'grouped-bar'
  answer: string
  followups: string[]
  sql: string
}

const BLUE = '#2182BF'
const STARTERS = [
  'Where am I losing sales?',
  "What can't my bot answer?",
  'What frustrates my guests, and about what?',
  'When do I most need a human on standby?',
]

function fmt(v: number, format: SpinSpec['measure']['format']): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (format === 'pct') return `${(v * 100).toFixed(1)}%`
  if (format === 'sec') return v >= 60 ? `${Math.round(v / 60)}m` : `${Math.round(v)}s`
  return Number(v).toLocaleString()
}

/** The fact-check line: exactly what the chart shows. */
function caption(spec: SpinSpec): string {
  const faces = spec.dims.map((d) => d.label).join(' and ')
  const filters = spec.filters.length ? ` · ${spec.filters.map((f) => `${f.label}: ${f.value}`).join(', ')}` : ''
  return `${spec.measure.label} by ${faces}${filters} · ${formatRangeHuman(spec.from, spec.to)}`
}

export function Freeride() {
  const { botId } = useParams<{ botId: string }>()
  const range = resolveSelection({ kind: 'preset', preset: '90d' })
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpinResult | null>(null)

  async function spin(q: string) {
    const query = q.trim()
    if (!query || !botId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: Number(botId),
          from: range.from,
          to: range.to,
          question: query,
          current: result?.spec, // spin from what's on screen
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'spin failed')
      setResult(json as SpinResult)
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try rephrasing.')
    } finally {
      setLoading(false)
    }
  }

  const fmtV = (v: number) => fmt(v, result?.spec.measure.format ?? 'int')
  const data = (result?.rows ?? []).slice(0, 15).map((r) => ({
    name: result!.spec.dims.map((d) => String(r[d.key] ?? '')).join(' / '),
    value: Number(r.value),
  }))
  const isLine = result?.chartType === 'line'
  const chartHeight = isLine ? 320 : Math.max(240, data.length * 34 + 40)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
          <Sparkles className="h-6 w-6" style={{ color: BLUE }} strokeWidth={2.25} />
          Freeride
        </div>
        <p className="mt-1 text-sm text-slate-500">Ask anything about this resort's conversations. Then spin it.</p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); spin(question) }}
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-botscrew-400 focus-within:ring-2 focus-within:ring-botscrew-100"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={result ? 'Spin it… (e.g. "now by sentiment", "just checkout")' : 'Ask anything…'}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          aria-label="Ask"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40"
          style={{ backgroundColor: BLUE }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.5} />}
        </button>
      </form>

      {!result && !loading && (
        <div className="mt-4 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => spin(s)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-botscrew-300 hover:bg-botscrew-50 hover:text-botscrew-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {result.answer && <p className="text-[15px] font-medium text-slate-800">{result.answer}</p>}
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">{caption(result.spec)}</p>

          <div className="mt-4" style={{ width: '100%', height: chartHeight }}>
            <ResponsiveContainer>
              {isLine ? (
                <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} tickFormatter={fmtV} width={44} />
                  <Tooltip formatter={(v) => fmtV(Number(v))} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3, fill: BLUE }} isAnimationActive />
                </LineChart>
              ) : (
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} tickFormatter={fmtV} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <Tooltip formatter={(v) => fmtV(Number(v))} cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
                  <Bar dataKey="value" fill={BLUE} radius={[0, 5, 5, 0]} isAnimationActive maxBarSize={26}>
                    <LabelList dataKey="value" position="right" formatter={(v) => fmtV(Number(v))} style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {result.followups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <span className="self-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Spin it</span>
              {result.followups.map((f) => (
                <button
                  key={f}
                  onClick={() => spin(f)}
                  disabled={loading}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-botscrew-300 hover:bg-botscrew-50 hover:text-botscrew-700 disabled:opacity-40"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
