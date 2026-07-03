import { useState, type FormEvent } from 'react'
import { Sparkles, CornerDownLeft, ChevronDown, Loader2, TriangleAlert } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

/**
 * ShredIntel AI — the "Ask your data" bar. A command-palette-style question box
 * plus curated prompt chips ("lenses"). Answers render inline as a card
 * (plain-English answer + optional chart + a "show the data" reveal), never a
 * chatbot takeover. Auto-scoped to the current bot; POSTs to /api/ask, where
 * the API key + read-only SQL live server-side.
 */

interface ChartHint {
  type: 'bar' | 'line' | 'none'
  x?: string
  y?: string
}
interface AskResult {
  answer: string
  chart: ChartHint | null
  sql: string
  rows: Record<string, unknown>[]
}

// Curated lenses — mirror the backend prompt library (api/_lib/prompts.ts).
const LENSES = [
  { id: 'top-topics', label: 'Top guest topics' },
  { id: 'knowledge-gaps', label: 'Biggest knowledge gaps' },
  { id: 'whats-changed', label: 'What changed' },
  { id: 'after-hours', label: 'After-hours demand' },
  { id: 'performance', label: 'Engagement & resolution' },
]

export function AskBar({ botId }: { botId: number }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showData, setShowData] = useState(false)

  async function ask(body: { question?: string; templateId?: string }) {
    setLoading(true)
    setError(null)
    setResult(null)
    setShowData(false)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, ...body }),
      })
      let data: AskResult & { error?: string }
      try {
        data = await res.json()
      } catch {
        throw new Error(`AI endpoint unavailable (${res.status}) — this works on the deployed preview.`)
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim() && !loading) ask({ question: query.trim() })
  }

  return (
    <div className="mb-8">
      <form onSubmit={onSubmit} className="relative">
        <Sparkles
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-botscrew-500"
          strokeWidth={2}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask your data…  e.g. what do guests ask about most?"
          aria-label="Ask your data"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-24 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>Ask <CornerDownLeft className="h-3.5 w-3.5" /></>
          )}
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => !loading && ask({ templateId: l.id })}
            disabled={loading}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-botscrew-300 hover:text-botscrew-700 disabled:opacity-50"
          >
            {l.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-botscrew-500" /> Analyzing your data…
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-botscrew-500" strokeWidth={2} />
            <p className="text-[15px] leading-relaxed text-slate-800">{result.answer}</p>
          </div>

          {result.chart && result.chart.type !== 'none' && result.chart.x && result.chart.y && result.rows.length > 0 && (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                {result.chart.type === 'line' ? (
                  <LineChart data={result.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey={result.chart.x} tick={{ fontSize: 11 }} hide={result.rows.length > 12} />
                    <YAxis tick={{ fontSize: 11 }} width={44} />
                    <Tooltip />
                    <Line type="monotone" dataKey={result.chart.y} stroke="#3266ad" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={result.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey={result.chart.x} tick={{ fontSize: 11 }} hide={result.rows.length > 12} />
                    <YAxis tick={{ fontSize: 11 }} width={44} />
                    <Tooltip />
                    <Bar dataKey={result.chart.y} fill="#3266ad" radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowData((s) => !s)}
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-600"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${showData ? 'rotate-180' : ''}`} />
            {showData ? 'Hide' : 'Show'} the data
          </button>

          {showData && (
            <div className="mt-2 space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">{result.sql}</pre>
              {result.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        {Object.keys(result.rows[0]).map((k) => (
                          <th key={k} className="border-b border-slate-200 px-2 py-1 font-medium text-slate-500">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 15).map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="border-b border-slate-100 px-2 py-1 text-slate-700">{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
