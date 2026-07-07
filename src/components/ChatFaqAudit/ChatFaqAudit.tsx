import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, ChevronDown } from 'lucide-react'
import { brand } from '../../lib/chartTheme'

/**
 * Ahhh FAQ It — a discreet one-click probe. Opens a small modal; hit Go and it
 * peppers the bot with real guest questions, capturing each answer as a guest
 * would see it.
 *
 * The widget messages over WebSocket (no HTTP send endpoint), so the work runs
 * SERVER-SIDE in headless Chromium on our droplet (POST /api/probe proxies to
 * it) — never in the operator's browser. Defaults are baked in so the modal
 * stays a title + a Go button; URL/questions hide behind "Options".
 */

interface ProbeResult { q: string; a: string; ms: number; error?: string }

export interface ChatFaqAuditProps {
  open: boolean
  onClose: () => void
  /** Botscrew widget-demo URL to probe (must be on bots.getskitickets.com). */
  defaultUrl?: string
  /** Resort/bot label, shown small under the title. */
  botLabel?: string
}

// The "Ahhh FAQ It" starter set — what a real guest actually asks, spread across
// the knowledge categories the Knowledge card tracks. Editable under Options.
const STARTER_QUESTIONS = [
  'How much are lift tickets?',
  'What time do the lifts open and close?',
  'Do you offer group ski lessons for beginners?',
  'Where do I park and how much does it cost?',
  'Can I rent skis and snowboards on-site?',
  'What are your ticket refund and cancellation policies?',
  'Is there a terrain park?',
  'Do you allow uphill skiing or skinning?',
  'Do you have snow tubing?',
  'What food and dining options are on the mountain?',
  'Are lessons available for kids, and what ages?',
  'What is the difference between your season passes?',
  'Do you have night skiing?',
  'What is today\'s snow report and conditions?',
  'Is there lodging at the resort?',
  'Are dogs or pets allowed on the mountain?',
]

const DEFAULT_URL =
  'https://bots.getskitickets.com/widget-demo/b924a927-14f8-4955-ac87-0a74e73408df?isTestMode=true'

// Light gap heuristic (immediate value; knowledge-layer grading comes later).
// An answer looks like a gap when it's empty or hedges/deflects.
const GAP_RE = /\b(don'?t (?:know|have)|not sure|unable to|no information|couldn'?t find|can'?t find|contact (?:us|the resort|our)|reach out|not able to)\b/i
const isGap = (r: ProbeResult) => !!r.error || !r.a?.trim() || GAP_RE.test(r.a)

export function ChatFaqAudit({ open, onClose, defaultUrl, botLabel }: ChatFaqAuditProps) {
  const [url, setUrl] = useState(defaultUrl || DEFAULT_URL)
  const [questionsText, setQuestionsText] = useState(STARTER_QUESTIONS.join('\n'))
  const [showOptions, setShowOptions] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<ProbeResult[]>([])
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) { setStatus('idle'); setResults([]); setError(''); setShowOptions(false) }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && status !== 'running' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, status, onClose])

  const questions = useMemo(
    () => questionsText.split('\n').map((q) => q.trim()).filter(Boolean),
    [questionsText],
  )
  const summary = useMemo(() => {
    const answered = results.filter((r) => !isGap(r)).length
    return { answered, gaps: results.length - answered }
  }, [results])

  async function go() {
    setStatus('running'); setError(''); setResults([])
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ widgetUrl: url.trim(), questions, concurrency: 4 }),
        signal: abortRef.current.signal,
      })
      const raw = await res.text()
      let json: { results?: ProbeResult[]; error?: string } = {}
      try { json = raw ? JSON.parse(raw) : {} } catch {
        throw new Error(res.ok ? 'The probe service is not reachable yet.' : `Probe failed (${res.status})`)
      }
      if (!res.ok) throw new Error(json.error || `Probe failed (${res.status})`)
      setResults(Array.isArray(json.results) ? json.results : [])
      setStatus('done')
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setStatus('idle'); return }
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('error')
    }
  }

  if (!open) return null
  const validUrl = /^https:\/\/bots\.getskitickets\.com\//.test(url.trim())
  const wide = status === 'done'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className={`my-8 w-full ${wide ? 'max-w-2xl' : 'max-w-sm'} overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 transition-all`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight" style={{ color: brand.heading }}>
              Ahhh FAQ It
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {botLabel ? `${botLabel} · ` : ''}pepper the bot with {questions.length} real questions
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'running'}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-3">
          {/* Idle / error — the "Go" face */}
          {(status === 'idle' || status === 'error') && (
            <div className="space-y-3">
              <button
                onClick={go}
                disabled={!validUrl || questions.length === 0}
                className="w-full rounded-xl py-3 text-base font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: brand.blue }}
              >
                Go
              </button>

              {status === 'error' && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Discreet advanced disclosure — URL + questions, collapsed by default */}
              <button
                onClick={() => setShowOptions((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-slate-600"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
                Options
              </button>
              {showOptions && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500">Test widget URL</span>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      spellCheck={false}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-[11px] text-slate-800 outline-none focus:border-botscrew-500"
                    />
                    {!validUrl && url.trim() !== '' && (
                      <span className="mt-1 block text-[10px] text-rose-600">Must be a bots.getskitickets.com widget URL.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500">Questions · one per line</span>
                    <textarea
                      value={questionsText}
                      onChange={(e) => setQuestionsText(e.target.value)}
                      rows={6}
                      spellCheck={false}
                      className="mt-1 w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-botscrew-500"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Running */}
          {status === 'running' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: brand.blue }} />
              <p className="text-sm font-medium text-slate-700">Asking {questions.length} questions…</p>
              <p className="max-w-[16rem] text-[11px] leading-snug text-slate-400">
                Driving the live widget headless on the server — real answers, a few at a time.
              </p>
              <button onClick={() => abortRef.current?.abort()} className="mt-1 text-[11px] text-slate-400 underline hover:text-slate-600">
                Cancel
              </button>
            </div>
          )}

          {/* Results */}
          {status === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> {summary.answered} answered
                </span>
                <span className={`inline-flex items-center gap-1.5 font-semibold ${summary.gaps ? 'text-amber-600' : 'text-slate-400'}`}>
                  <AlertTriangle className="h-4 w-4" /> {summary.gaps} potential gap{summary.gaps === 1 ? '' : 's'}
                </span>
              </div>

              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {results.map((r, i) => {
                  const gap = isGap(r)
                  return (
                    <div key={i} className={`rounded-lg border px-3 py-2 ${gap ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-start gap-2">
                        {gap ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
                        <p className="text-[13px] font-semibold text-slate-800">{r.q}</p>
                      </div>
                      <p className="mt-1 pl-6 text-[12px] leading-relaxed text-slate-600">
                        {r.error ? <span className="italic text-rose-500">{r.error}</span>
                          : r.a?.trim() ? r.a
                          : <span className="italic text-amber-600">No answer returned</span>}
                      </p>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400">gaps are heuristic — layer grading comes next</span>
                <button onClick={() => setStatus('idle')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
