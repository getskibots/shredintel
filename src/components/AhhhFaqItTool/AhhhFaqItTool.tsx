import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Play, CheckCircle2, AlertTriangle, RotateCcw, Users, Sparkles } from 'lucide-react'
import { brand } from '../../lib/chartTheme'
import { useAvailableBots } from '../../data/useAnalytics'
import { probeUrlFor, widgetUrlFor, isValidWidgetUrl } from '../../lib/probeTargets'

/**
 * Ahhh FAQ It — standalone tool. Pick a resort, choose a scope (everything, or
 * focus one category like Ecommerce), and Go: a GPT writes ~N realistic guest
 * threads, the droplet runs them against the live bot, and we show each guest's
 * conversation + coverage. Reachable at /#/tools/ahhh-faq-it.
 */

interface Category { key: string; label: string; hint?: string }
interface GenThread { category: string; persona: string; questions: string[] }
interface Turn { q: string; a: string; ms: number; error?: string }
interface ProbeThread { turns: Turn[]; error?: string }
interface GuestResult extends GenThread { result?: ProbeThread }

// Fallback so the selector renders even when /api isn't reachable (local dev).
const FALLBACK_CATEGORIES: Category[] = [
  { key: 'ecommerce', label: '💳 Ecommerce & Checkout' },
  { key: 'resort_info', label: '🏔 Resort Info' },
  { key: 'tickets_passes', label: '🎫 Tickets & Passes' },
  { key: 'refunds', label: '📆 Refund Policies' },
  { key: 'ski_activities', label: '⛷ Ski & Snowboard' },
  { key: 'lessons', label: '🏫 Lessons & Ski School' },
  { key: 'rentals', label: '🎿 Equipment Rental' },
  { key: 'lodging', label: '🏨 Lodging' },
  { key: 'dining', label: '🍽 Dining & Après' },
  { key: 'parking_transit', label: '🚌 Parking & Transit' },
]

const GAP_RE = /\b(don'?t (?:know|have)|not sure|unable to|no information|couldn'?t find|can'?t find|contact (?:us|the resort|our)|reach out|not able to)\b/i
const isGap = (t: Turn) => !!t.error || !t.a?.trim() || GAP_RE.test(t.a)
const catLabel = (cats: Category[], key: string) => cats.find((c) => c.key === key)?.label || key

export function AhhhFaqItTool() {
  const { bots } = useAvailableBots()
  const [categories, setCategories] = useState<Category[]>(FALLBACK_CATEGORIES)
  const [botId, setBotId] = useState(43)
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [urlOverride, setUrlOverride] = useState('')
  const [scope, setScope] = useState('all')
  const [mode, setMode] = useState<'focus' | 'custom'>('focus')
  const [customPrompt, setCustomPrompt] = useState('')
  const [resortUrl, setResortUrl] = useState('')
  const [guests, setGuests] = useState(10)
  const [status, setStatus] = useState<'idle' | 'generating' | 'running' | 'done' | 'error'>('idle')
  const [guestResults, setGuestResults] = useState<GuestResult[]>([])
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Category list (single source of truth = the generator endpoint).
  useEffect(() => {
    fetch('/api/generate-threads')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.categories?.length) setCategories(j.categories) })
      .catch(() => { /* keep fallback */ })
  }, [])

  const selectedBot = useMemo(() => bots.find((b) => b.botId === botId), [bots, botId])
  const botName = selectedBot?.label || `Bot ${botId}`
  const widgetUrl = urlOverride.trim() || widgetUrlFor(selectedBot?.publicIdentifier) || probeUrlFor(botId) || ''
  const willProbe = isValidWidgetUrl(widgetUrl)  // otherwise generate-only (onboarding a new resort)
  const canRun = status !== 'generating' && status !== 'running' && (mode !== 'custom' || customPrompt.trim().length > 0)

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? bots.filter((b) => b.label.toLowerCase().includes(q)) : bots
    return list.slice(0, 60)
  }, [bots, search])

  const summary = useMemo(() => {
    const turns = guestResults.flatMap((g) => g.result?.turns || [])
    const gaps = turns.filter(isGap).length
    const covered = new Set(guestResults.map((g) => g.category))
    const probed = guestResults.some((g) => g.result)
    return { total: turns.length, answered: turns.length - gaps, gaps, covered: covered.size, probed }
  }, [guestResults])

  async function go() {
    setError(''); setGuestResults([]); setStatus('generating')
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    try {
      // 1. Generate the guest threads.
      const gen = await fetch('/api/generate-threads', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ scope, mode, customPrompt, resortUrl: resortUrl.trim(), guests, resort: botName }),
      })
      const genJson = await gen.json()
      if (!gen.ok) throw new Error(genJson?.error || 'Question generation failed')
      const threads: GenThread[] = Array.isArray(genJson.threads) ? genJson.threads : []
      if (!threads.length) throw new Error('No threads generated')
      setGuestResults(threads.map((t) => ({ ...t }))) // show threads immediately

      // 2. Run them against the live bot — unless there's no bot yet (onboarding),
      // in which case we stop at the generated questions.
      if (!willProbe) { setStatus('done'); return }
      setStatus('running')
      const probe = await fetch('/api/probe', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ widgetUrl, threads: threads.map((t) => t.questions), concurrency: Math.min(12, guests) }),
      })
      const probeJson = await probe.json()
      if (!probe.ok) throw new Error(probeJson?.error || 'Probe run failed')
      const results: ProbeThread[] = Array.isArray(probeJson.results) ? probeJson.results : []
      setGuestResults(threads.map((t, i) => ({ ...t, result: results[i] })))
      setStatus('done')
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setStatus('idle'); return }
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const busy = status === 'generating' || status === 'running'

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center"
      style={{ backgroundImage: "linear-gradient(263deg, rgba(0,0,0,0.84) 23%, rgba(150,20,20,0.35) 100%), url('https://getskibots.com/wp-content/uploads/2025/08/Untitled-1.jpg')" }}
    >
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        {/* Branding — mirrors getskibots.com/tools/ahhh-faq-it */}
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold uppercase tracking-wide text-white sm:text-4xl" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Ahhh FAQ It!</h1>
          <p className="mx-auto mt-2 max-w-xl text-[13px] font-semibold uppercase tracking-widest text-white/85">Generate the top 100 questions that bury your resort year-round</p>
        </header>

      {/* Config */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium text-slate-700">Resort</span>
            <div className="relative">
              <input
                value={pickerOpen ? search : botName}
                onChange={(e) => { setSearch(e.target.value); setPickerOpen(true) }}
                onFocus={() => { setSearch(''); setPickerOpen(true) }}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder="Search resorts…"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-botscrew-500"
              />
              {pickerOpen && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {matches.length === 0 && <li className="px-3 py-2 text-[13px] text-slate-400">No resorts match</li>}
                  {matches.map((b) => (
                    <li key={b.botId}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setBotId(b.botId); setUrlOverride(''); setSearch(''); setPickerOpen(false) }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition hover:bg-botscrew-50 ${b.botId === botId ? 'font-semibold text-botscrew-700' : 'text-slate-700'}`}
                      >
                        <span className="truncate">{b.label}</span>
                        {!b.publicIdentifier && !probeUrlFor(b.botId) && <span className="ml-2 shrink-0 text-[10px] text-amber-500">needs URL</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </label>

          <div className="block">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-700">Questions</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[11px] font-semibold">
                <button type="button" onClick={() => setMode('focus')} className={`rounded-md px-2 py-0.5 transition ${mode === 'focus' ? 'bg-botscrew-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Focus</button>
                <button type="button" onClick={() => setMode('custom')} className={`rounded-md px-2 py-0.5 transition ${mode === 'custom' ? 'bg-botscrew-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>Custom</button>
              </div>
            </div>
            {mode === 'focus' ? (
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-botscrew-500"
              >
                <option value="all">🌐 Everything (macro sweep)</option>
                {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            ) : (
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="Your own steer — e.g. 'hammer the new gondola + Ikon pass' or 'act like a frustrated first-timer'."
                className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-botscrew-500"
              />
            )}
          </div>
        </div>

        {/* Resort website — grounds questions in the real site (key for onboarding) */}
        <label className="mt-4 block">
          <span className="text-[13px] font-medium text-slate-700">Resort website <span className="text-slate-400">(optional — reads the real site so questions match this resort)</span></span>
          <input
            value={resortUrl}
            onChange={(e) => setResortUrl(e.target.value)}
            spellCheck={false}
            placeholder="https://www.jacksonhole.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-botscrew-500"
          />
        </label>

        {/* widget URL — auto-derived from the bot's UUID; paste only if none */}
        {!widgetUrl && (
          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-slate-700">Test widget URL <span className="text-slate-400">(no mapping for this resort yet)</span></span>
            <input
              value={urlOverride}
              onChange={(e) => setUrlOverride(e.target.value)}
              spellCheck={false}
              placeholder="https://bots.getskitickets.com/widget-demo/…?isTestMode=true"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[12px] text-slate-800 outline-none focus:border-botscrew-500"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <Users className="h-4 w-4 text-slate-400" />
            <input type="range" min={3} max={16} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-32 accent-botscrew-500" />
            <span className="font-semibold tabular-nums text-slate-800">{guests}</span> guests
          </label>
          <button
            onClick={go}
            disabled={!canRun}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-base font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: brand.blue }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy ? (status === 'generating' ? 'Writing questions…' : 'Peppering the bot…') : 'Go'}
          </button>
        </div>

        {status === 'error' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {guestResults.length > 0 && (
        <div className="mt-6 space-y-4">
          {status === 'done' && summary.probed && (
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Guests" value={guestResults.length} tone="plain" />
              <Stat label="Answered" value={summary.answered} tone="good" />
              <Stat label="Potential gaps" value={summary.gaps} tone={summary.gaps ? 'warn' : 'good'} />
              <Stat label="Categories hit" value={summary.covered} tone="plain" />
            </div>
          )}
          {status === 'done' && !summary.probed && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Guests" value={guestResults.length} tone="plain" />
              <Stat label="Categories" value={summary.covered} tone="plain" />
            </div>
          )}

          {busy && status === 'running' && (
            <p className="text-center text-[12px] text-slate-400">
              {guestResults.length} guests are chatting with the bot on the server (headless) — real conversations, a few at a time. ~1–2 min.
            </p>
          )}

          <div className="space-y-3">
            {guestResults.map((g, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{i + 1}</span>
                  <span className="rounded-full bg-botscrew-50 px-2 py-0.5 text-[11px] font-semibold text-botscrew-700">{catLabel(categories, g.category)}</span>
                  {g.persona && <span className="text-[12px] italic text-slate-400">{g.persona}</span>}
                </div>
                <div className="space-y-2 pl-8">
                  {(g.result?.turns || g.questions.map((q) => ({ q, a: '', ms: 0 }))).map((t, j) => {
                    const turn = t as Turn
                    const answered = !!turn.a && !isGap(turn)
                    const gap = !!turn.a && isGap(turn)
                    return (
                      <div key={j} className={`rounded-lg px-3 py-2 ${gap ? 'bg-amber-50/60' : 'bg-slate-50'}`}>
                        <p className="text-[13px] font-semibold text-slate-800">{turn.q}</p>
                        <div className="mt-0.5 flex items-start gap-1.5">
                          {turn.a ? (answered ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />)
                            : (busy ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-slate-300" /> : <span className="w-3.5" />)}
                          <p className="text-[12px] leading-relaxed text-slate-600">
                            {turn.error ? <span className="italic text-rose-500">{turn.error}</span>
                              : turn.a ? turn.a
                              : <span className="italic text-slate-400">{busy ? 'waiting…' : '—'}</span>}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {status === 'done' && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">gaps are heuristic — knowledge-layer grading comes next</span>
              <button onClick={() => { setStatus('idle'); setGuestResults([]) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50">
                <RotateCcw className="h-3.5 w-3.5" /> New run
              </button>
            </div>
          )}
        </div>
      )}

      {guestResults.length === 0 && status === 'idle' && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-white/70">
          <Sparkles className="h-3.5 w-3.5" /> Pick a resort + focus, then Go. A GPT writes the guests; the droplet runs them live.
        </p>
      )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: 'good' | 'warn' | 'plain' }) {
  const color = tone === 'good' ? '#2E9B6B' : tone === 'warn' ? '#D97706' : brand.slate
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-center">
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}
