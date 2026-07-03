import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Sparkles, ArrowUp, Mic, ChevronDown, Loader2, TriangleAlert } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { brand } from '../../lib/chartTheme'
import { VOICE_PROFILES, DEFAULT_VOICE_ID } from '../../lib/voices'
import { VegaLiteChart } from '../VegaLiteChart'

/**
 * ShredIntel hero search — the dashboard's spine. Ask any question about the
 * resort's data in plain English (or by voice); the answer renders inline as a
 * card (plain-English insight + optional chart + a "show the data" reveal).
 * Auto-scoped to the current bot; POSTs to /api/ask, where the API key +
 * enrichment-aware read-only SQL live server-side.
 */

interface ChartHint {
  type: 'bar' | 'line' | 'none'
  x?: string
  y?: string
}
interface AskResult {
  answer: string
  chart: ChartHint | null
  vegaLite?: Record<string, unknown> | null
  sql: string
  rows: Record<string, unknown>[]
}

// Curated lenses — ids mirror the backend prompt library (api/_lib/prompts.ts).
const LENSES = [
  { id: 'frustrations', label: 'What are guests most frustrated about?' },
  { id: 'revenue-risk', label: 'Where am I losing revenue?' },
  { id: 'kb-gaps', label: 'What should I add to my knowledge base?' },
  { id: 'whats-changed', label: 'What changed this week?' },
]

export function AskBar({ botId }: { botId: number }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showData, setShowData] = useState(false)
  const [listening, setListening] = useState(false)
  const recogRef = useRef<{ stop: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
  const [voiceId, setVoiceId] = useState<string>(() => {
    try { return localStorage.getItem(`shredintel_voice_${botId}`) || DEFAULT_VOICE_ID } catch { return DEFAULT_VOICE_ID }
  })
  useEffect(() => { try { localStorage.setItem(`shredintel_voice_${botId}`, voiceId) } catch { /* noop */ } }, [botId, voiceId])

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
        throw new Error(`The AI service returned a ${res.status} error. If this persists, check the /api/ask function logs in Vercel.`)
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

  function toggleMic() {
    if (!SR) return
    if (listening) {
      recogRef.current?.stop()
      setListening(false)
      return
    }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = false
    r.maxAlternatives = 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript ?? ''
      setQuery(t)
      setListening(false)
      if (t.trim()) ask({ question: t.trim() })
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recogRef.current = r
    setListening(true)
    r.start()
  }

  return (
    <div className="mx-auto mb-10 max-w-3xl">
      <div className="mb-2.5 flex items-center justify-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">ShredIntel voice</span>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5">
          {VOICE_PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setVoiceId(p.id)}
              title={p.blurb}
              className={[
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                voiceId === p.id ? 'bg-botscrew-500 text-white' : 'text-slate-500 hover:text-slate-800',
              ].join(' ')}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={onSubmit} className="relative">
        <Sparkles
          className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-botscrew-500"
          strokeWidth={2}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask your resort’s data…  e.g. where am I losing revenue?"
          aria-label="Ask your resort’s data"
          className="w-full rounded-full border border-slate-200 bg-white py-4 pl-14 pr-28 text-base text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
        />
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {SR && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? 'Stop listening' : 'Ask by voice'}
              className={[
                'flex h-11 w-11 items-center justify-center rounded-full border transition',
                listening
                  ? 'animate-pulse border-rose-300 bg-rose-50 text-rose-600'
                  : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <Mic className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Ask"
            className={[
              'flex h-11 w-11 items-center justify-center rounded-full transition',
              query.trim() && !loading
                ? 'bg-botscrew-500 text-white hover:bg-botscrew-600'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            ].join(' ')}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.2} />}
          </button>
        </div>
      </form>

      <div className="mt-3.5 flex flex-wrap justify-center gap-2">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => !loading && ask({ templateId: l.id })}
            disabled={loading}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] text-botscrew-700 transition hover:border-botscrew-300 hover:bg-botscrew-50 disabled:opacity-50"
          >
            {l.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-400">
        Ask by typing, by voice with the mic, or tap a starter above.
      </p>

      {loading && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-botscrew-500" /> ShredIntel is carving through your conversations…
        </div>
      )}

      {error && !loading && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {result && !loading && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-botscrew-500" strokeWidth={2} />
            ShredIntel
          </div>
          <p className="text-[15px] leading-relaxed text-slate-800">{result.answer}</p>

          {result.vegaLite && result.rows.length > 0 ? (
            <div className="mt-4">
              <VegaLiteChart spec={result.vegaLite} rows={result.rows} />
            </div>
          ) : result.chart && result.chart.type !== 'none' && result.chart.x && result.chart.y && result.rows.length > 0 ? (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                {result.chart.type === 'line' ? (
                  <LineChart data={result.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey={result.chart.x} tick={{ fontSize: 11, fill: brand.muted }} hide={result.rows.length > 12} />
                    <YAxis tick={{ fontSize: 11, fill: brand.muted }} width={44} />
                    <Tooltip />
                    <Line type="monotone" dataKey={result.chart.y} stroke={brand.slate} strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={result.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey={result.chart.x} tick={{ fontSize: 11, fill: brand.muted }} hide={result.rows.length > 12} />
                    <YAxis tick={{ fontSize: 11, fill: brand.muted }} width={44} />
                    <Tooltip />
                    <Bar dataKey={result.chart.y} fill={brand.blue} radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : null}

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
