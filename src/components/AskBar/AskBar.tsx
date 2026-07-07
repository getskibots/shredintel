import { useRef, useState, type FormEvent } from 'react'
import { Sparkles, ArrowUp, AudioLines, Mic, ChevronDown, Loader2, TriangleAlert, Target, Zap, TrendingUp, MessagesSquare, Brush } from 'lucide-react'
import { useBranding } from '../../data/useBranding'
import { BrandingBackdrop, BrandingEditor } from '../Branding'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { brand } from '../../lib/chartTheme'
import { VegaLiteChart } from '../VegaLiteChart'
import { ConversationExplorer } from '../ConversationExplorer'
import { PromptEditor } from '../PromptEditor'
import { RichText } from '../shared'
import type { DrillFilter } from '../../lib/savedReports'
import { payloadFromDatum, type DrillPayload } from '../../lib/drill'

/**
 * ShredIntel hero — the dashboard's spine and its identity. A centered,
 * vertically-composed hero (rule of thirds on the VERTICAL axis): the header
 * sits up top, the ask bar is the focal element, starter lenses below. Ask any
 * question about the resort's data in plain English or by voice; the answer
 * renders below as a card. Auto-scoped to the current bot; POSTs to /api/ask.
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
  focus?: string | null
  drill?: { dimension: string; value: string; label: string } | null
  window?: { from: string; to: string } | null
  sql: string
  rows: Record<string, unknown>[]
}

// Three action-oriented starters (rule-of-thirds trio): diagnose → act → grow.
// The punchy label is what the manager sees; `id` maps to the specific question
// in the backend prompt library (api/_lib/prompts.ts).
const LENSES = [
  { id: 'frustrations', label: 'Find pain points', Icon: Target },
  { id: 'kb-gaps', label: 'Get quick wins', Icon: Zap },
  { id: 'revenue-risk', label: 'Capture more revenue', Icon: TrendingUp },
]

// One-line chart caption (lens + window) built from request context — never the
// model — so every AI chart states what it's showing (specSanitizer policy).
function chartCaption(focus: string | null | undefined, rangeLabel?: string): string {
  const lens =
    focus === 'core' ? 'Conversation volume'
    : focus === 'identity' ? 'Guests'
    : focus === 'context' ? 'Sessions'
    : 'Substantive conversations'
  return rangeLabel ? `${lens} · ${rangeLabel}` : lens
}

export function AskBar({ botId, range, onVoice }: { botId: number; range?: { from: string; to: string; label: string }; onVoice?: () => void }) {
  const { branding, reload: reloadBranding } = useBranding(botId)
  const [brandingOpen, setBrandingOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AskResult | null>(null)
  const [drill, setDrill] = useState<DrillFilter | null>(null)
  const [drillPayload, setDrillPayload] = useState<DrillPayload | null>(null)
  const openDrill = (datum: Record<string, unknown>) => {
    // Scope the drill to the answer's window (the dates the query actually used),
    // falling back to the dashboard picker.
    const dp = payloadFromDatum(datum, { botId, from: result?.window?.from ?? range?.from, to: result?.window?.to ?? range?.to })
    if (dp) setDrillPayload(dp)
  }
  const [error, setError] = useState<string | null>(null)
  const [showData, setShowData] = useState(false)
  const [listening, setListening] = useState(false)
  const recogRef = useRef<{ stop: () => void } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

  async function ask(body: { question?: string; templateId?: string }) {
    setLoading(true)
    setError(null)
    setResult(null)
    setDrill(null)
    setDrillPayload(null)
    setShowData(false)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, from: range?.from, to: range?.to, ...body }),
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
    <div className="mb-10">
      <div className="relative">
        <BrandingBackdrop url={branding?.backgroundUrl} overlay={branding?.overlay ?? 0.6} />
        {/* discreet per-bot branding editor */}
        <div className="absolute right-2 top-2 z-30">
          <button
            type="button"
            onClick={() => setBrandingOpen((o) => !o)}
            aria-label="Branding"
            title="Branding"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/70 text-slate-400 opacity-50 backdrop-blur transition hover:opacity-100 hover:text-slate-700"
          >
            <Brush className="h-4 w-4" />
          </button>
          {brandingOpen && (
            <BrandingEditor botId={botId} branding={branding} onSaved={reloadBranding} onClose={() => setBrandingOpen(false)} />
          )}
        </div>
        <div className="relative z-10 mx-auto flex min-h-[46vh] max-w-3xl flex-col items-center justify-center text-center">
          {/* Header — the per-bot logo (uploaded) or the ShredIntel wordmark */}
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Resort logo" className="mb-3 h-9 w-auto max-w-[220px] object-contain" />
          ) : (
            <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-botscrew-500">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} /> ShredIntel
            </div>
          )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px] sm:leading-tight">
          Your conversational intelligence layer
        </h1>
        <p className="mt-2 max-w-lg text-sm text-slate-500">
          Ask anything about your guests’ conversations — in plain English or by voice, and ShredIntel answers and charts it on the spot.
        </p>

        {/* Ask bar — the focal element */}
        <form onSubmit={onSubmit} className="relative mt-7 w-full">
          <Sparkles
            className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-botscrew-500"
            strokeWidth={2}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask your resort’s data…  e.g. where am I losing revenue?"
            aria-label="Ask your resort’s data"
            className="w-full rounded-full border border-slate-200 bg-white py-4 pl-14 pr-40 text-base text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
          />
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {SR && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? 'Stop listening' : 'Dictate your question'}
                title="Dictate your question"
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
            {onVoice && (
              <button
                type="button"
                onClick={onVoice}
                aria-label="Talk to ShredIntel by voice"
                title="Talk to ShredIntel"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-botscrew-200 bg-botscrew-50 text-botscrew-600 transition hover:bg-botscrew-100"
              >
                <AudioLines className="h-5 w-5" strokeWidth={2} />
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

        {/* Starter lenses — three action items: diagnose → act → grow */}
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => !loading && ask({ templateId: l.id })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-botscrew-300 hover:bg-botscrew-50 hover:text-botscrew-700 disabled:opacity-50"
            >
              <l.Icon className="h-4 w-4 text-botscrew-500" strokeWidth={2} />
              {l.label}
            </button>
          ))}
        </div>

        <p className="mt-3.5 text-[11px] text-slate-400">
          Type it, dictate with the mic, or talk to ShredIntel — or tap a starter above.
        </p>
        <div className="mt-1.5">
          <PromptEditor botId={botId} />
        </div>
        </div>
      </div>

      {/* Answer + states — readable column below the hero */}
      <div className="mx-auto max-w-3xl">
        {loading && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-botscrew-500" /> ShredIntel is carving through your conversations…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}

        {result && !loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-botscrew-500" strokeWidth={2} />
              ShredIntel
              {range?.label && <span className="text-slate-300">· {range.label}</span>}
            </div>
            <p className="text-[15px] leading-relaxed text-slate-800"><RichText text={result.answer} /></p>

            {result.vegaLite && result.rows.length > 0 ? (
              <div className="mt-4">
                <VegaLiteChart spec={result.vegaLite} rows={result.rows} caption={chartCaption(result.focus, range?.label)} onDrill={openDrill} />
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
                      <Bar
                      dataKey={result.chart.y}
                      fill={brand.blue}
                      radius={[3, 3, 0, 0]}
                      cursor="pointer"
                      onClick={(d: { payload?: Record<string, unknown> }) => d?.payload && openDrill(d.payload)}
                    />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : null}

            {result.drill && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => result.drill && setDrill({ dim: result.drill.dimension as DrillFilter['dim'], value: result.drill.value, label: result.drill.label })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-botscrew-200 bg-botscrew-50 px-3.5 py-1.5 text-xs font-semibold text-botscrew-700 transition hover:bg-botscrew-100"
                >
                  <MessagesSquare className="h-3.5 w-3.5" /> Read the {result.drill.label} conversations
                </button>
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

      {drill && <ConversationExplorer botId={botId} range={range} filter={drill} onClose={() => setDrill(null)} />}
      {drillPayload && <ConversationExplorer botId={botId} payload={drillPayload} onClose={() => setDrillPayload(null)} />}
    </div>
  )
}
