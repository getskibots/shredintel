import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import type { FleetDay } from '../../data/useFleetTimeseries'

/**
 * The seasonality ribbon — the fleet's daily volume over ~2 years as a single-hue
 * column chart, with faint winter/summer season washes. A draggable window (or the
 * Play button) scrubs the seasons: the ribbon's own mood headline updates instantly
 * from the preloaded daily data, and on release the window sets the dashboard's date
 * range so every card below follows. Calm on purpose — mood lives in the headline,
 * not 100 colored bars.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parse = (d: string) => new Date(d + 'T00:00:00')
const seasonOf = (m: number) => (m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'fall')
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

interface Week { i0: number; i1: number; startDay: string; endDay: string; convs: number; pos: number; neu: number; neg: number; resolved: number; month: number }

function condition(posPct: number, negPct: number): { emoji: string; label: string } {
  if (negPct >= 11) return { emoji: '🌧️', label: 'Unsettled' }
  if (posPct >= 28) return { emoji: '☀️', label: 'Bluebird' }
  if (posPct >= 22) return { emoji: '🌤️', label: 'Mostly sunny' }
  return { emoji: '⛅', label: 'Partly cloudy' }
}

export function SeasonRibbon({
  data,
  from,
  to,
  onSelect,
}: {
  data: FleetDay[] | null
  /** Currently-selected window (ISO), to position the brush. */
  from: string
  to: string
  /** Set the dashboard's date range from the brushed window. */
  onSelect: (from: string, to: string) => void
}) {
  // Bucket days into weeks (chunks of 7) for a clean ribbon.
  const weeks = useMemo<Week[]>(() => {
    if (!data || !data.length) return []
    const out: Week[] = []
    for (let i = 0; i < data.length; i += 7) {
      const chunk = data.slice(i, i + 7)
      const w: Week = {
        i0: i, i1: Math.min(i + 7, data.length),
        startDay: chunk[0].day, endDay: chunk[chunk.length - 1].day,
        convs: 0, pos: 0, neu: 0, neg: 0, resolved: 0, month: parse(chunk[0].day).getMonth(),
      }
      for (const d of chunk) { w.convs += d.convs; w.pos += d.pos; w.neu += d.neu; w.neg += d.neg; w.resolved += d.resolved }
      out.push(w)
    }
    return out
  }, [data])

  const N = weeks.length
  const maxConv = useMemo(() => Math.max(1, ...weeks.map((w) => w.convs)), [weeks])

  // Map the selected range → week indices (the brush window).
  const rangeToWin = useCallback((f: string, t: string) => {
    if (!N) return { i0: 0, i1: 0 }
    let i0 = weeks.findIndex((w) => w.endDay >= f)
    if (i0 < 0) i0 = 0
    let i1 = weeks.findIndex((w) => w.startDay > t)
    if (i1 < 0) i1 = N
    return { i0: Math.max(0, i0), i1: Math.max(i0 + 1, i1) }
  }, [weeks, N])

  const [win, setWin] = useState({ i0: 0, i1: 0 })
  const dragging = useRef(false)
  const playing = useRef(false)

  // Keep the brush in sync with the range when it changes externally (picker, Daily Fix),
  // but never fight an in-progress drag or playback.
  useEffect(() => {
    if (dragging.current || playing.current) return
    setWin(rangeToWin(from, to))
  }, [from, to, rangeToWin])

  // Windowed aggregate for the ribbon's own headline (instant, from the array).
  const agg = useMemo(() => {
    const w = { convs: 0, pos: 0, neu: 0, neg: 0, resolved: 0 }
    for (let i = win.i0; i < win.i1 && i < N; i++) { const x = weeks[i]; w.convs += x.convs; w.pos += x.pos; w.neu += x.neu; w.neg += x.neg; w.resolved += x.resolved }
    const sent = w.pos + w.neu + w.neg || 1
    return { ...w, posPct: (100 * w.pos) / sent, neuPct: (100 * w.neu) / sent, negPct: (100 * w.neg) / sent, resPct: w.convs ? (100 * w.resolved) / w.convs : 0 }
  }, [win, weeks, N])

  const cond = condition(agg.posPct, agg.negPct)
  const days = Math.max(1, (win.i1 - win.i0) * 7)
  const winLabel = useMemo(() => {
    if (!N || win.i1 <= win.i0) return ''
    const a = parse(weeks[win.i0].startDay), b = parse(weeks[Math.min(win.i1, N) - 1].endDay)
    const yr = (d: Date) => `’${String(d.getFullYear()).slice(2)}`
    return `${MONTHS[a.getMonth()]} ${yr(a)} – ${MONTHS[b.getMonth()]} ${yr(b)}`
  }, [win, weeks, N])

  // ---- brush drag -----------------------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startWin = useRef({ i0: 0, i1: 0 })
  const mode = useRef<'move' | 'l' | 'r' | null>(null)

  const commit = useCallback((w: { i0: number; i1: number }) => {
    if (!N) return
    onSelect(weeks[w.i0].startDay, weeks[Math.min(w.i1, N) - 1].endDay)
  }, [weeks, N, onSelect])

  const beginDrag = (e: React.PointerEvent, m: 'move' | 'l' | 'r') => {
    e.preventDefault(); e.stopPropagation()
    mode.current = m; dragging.current = true
    startX.current = e.clientX; startWin.current = { ...win }
  }
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!mode.current || !wrapRef.current || !N) return
      const px = wrapRef.current.getBoundingClientRect().width / N
      const dw = Math.round((e.clientX - startX.current) / px)
      const s = startWin.current
      let next = win
      if (mode.current === 'move') {
        const wd = s.i1 - s.i0
        let i0 = s.i0 + dw, i1 = s.i1 + dw
        if (i0 < 0) { i0 = 0; i1 = wd } if (i1 > N) { i1 = N; i0 = N - wd }
        next = { i0, i1 }
      } else if (mode.current === 'l') {
        next = { i0: Math.max(0, Math.min(s.i0 + dw, win.i1 - 1)), i1: win.i1 }
      } else {
        next = { i0: win.i0, i1: Math.min(N, Math.max(s.i1 + dw, win.i0 + 1)) }
      }
      setWin(next)
    }
    const onUp = () => {
      if (!mode.current) return
      mode.current = null; dragging.current = false
      commit(win)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [win, N, commit])

  // ---- play (sweep the window; commit range on pause) -----------------------
  const [isPlaying, setIsPlaying] = useState(false)
  useEffect(() => {
    if (!isPlaying || !N) return
    playing.current = true
    const wd = Math.max(1, win.i1 - win.i0)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.setInterval(() => {
      setWin((w) => {
        let i0 = w.i0 + 1, i1 = w.i1 + 1
        if (i1 > N) { i0 = 0; i1 = wd }
        return { i0, i1 }
      })
    }, reduce ? 500 : 140)
    return () => { window.clearInterval(id); playing.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, N])
  const togglePlay = () => {
    if (isPlaying) { setIsPlaying(false); commit(win) } // catch the dashboard up on pause
    else setIsPlaying(true)
  }

  if (data === null) {
    return <div className="mb-6 flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 shadow-sm">Loading the seasons…</div>
  }
  if (!N) {
    return <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400 shadow-sm">No daily history yet.</div>
  }

  const VB_W = 1000, VB_H = 184, base = 160, top = 8, colW = VB_W / N
  const leftPct = (win.i0 / N) * 100
  const widthPct = ((win.i1 - win.i0) / N) * 100

  // season labels at a few midpoints
  const labels: { text: string; f: number }[] = []
  let curSeason = '', segStart = 0
  weeks.forEach((w, i) => {
    const s = seasonOf(w.month)
    if (s !== curSeason) {
      if (curSeason === 'winter' || curSeason === 'summer') {
        const mid = (segStart + i) / 2 / N
        const yr = `’${String(parse(weeks[segStart].startDay).getFullYear()).slice(2)}`
        labels.push({ text: `${curSeason === 'winter' ? 'Winter' : 'Summer'} ${yr}`, f: mid })
      }
      curSeason = s; segStart = i
    }
  })

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Guest mood · over time</div>
          <h2 className="font-display text-base font-semibold text-slate-800">Fleet over time</h2>
        </div>
        <span className="text-xs text-slate-400">drag the window · or press play</span>
      </div>

      {/* Headline — updates instantly as you scrub */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden>{cond.emoji}</span>
          <div className="leading-tight">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Guest mood</div>
            <div className="font-display text-base font-semibold text-slate-800">{cond.label} · {Math.round(agg.posPct)}% positive</div>
          </div>
        </div>
        <span className="text-xs tabular-nums text-slate-400">
          <span className="text-emerald-600">{Math.round(agg.posPct)}%</span> · {Math.round(agg.neuPct)}% · <span className="text-rose-500">{Math.round(agg.negPct)}%</span>
        </span>
      </div>
      <div className="mb-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-emerald-400" style={{ width: `${agg.posPct}%` }} />
        <div className="bg-slate-300" style={{ width: `${agg.neuPct}%` }} />
        <div className="bg-rose-400" style={{ width: `${agg.negPct}%` }} />
      </div>
      <p className="mb-4 text-xs text-slate-500 tabular-nums">{fmt(agg.convs)} conversations · {fmt(agg.convs / days)}/day · {Math.round(agg.resPct)}% resolved</p>

      {/* Ribbon */}
      <div ref={wrapRef} className="relative select-none" style={{ touchAction: 'none' }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block h-[184px] w-full" aria-hidden="true">
          {weeks.map((w, i) => (seasonOf(w.month) === 'winter' || seasonOf(w.month) === 'summer') ? (
            <rect key={`b${i}`} x={(i * colW).toFixed(2)} y={0} width={(colW + 0.5).toFixed(2)} height={base}
              fill={seasonOf(w.month) === 'winter' ? 'rgba(33,130,191,.07)' : 'rgba(243,177,22,.06)'} />
          ) : null)}
          {weeks.map((w, i) => {
            const h = (w.convs / maxConv) * (base - top)
            const sel = i >= win.i0 && i < win.i1
            return <rect key={`c${i}`} x={(i * colW + colW * 0.12).toFixed(2)} y={(base - h).toFixed(2)}
              width={(colW * 0.76).toFixed(2)} height={Math.max(1, h).toFixed(2)} rx="1.2"
              fill="#2182bf" opacity={sel ? 1 : 0.24} style={{ transition: 'opacity .12s ease' }} />
          })}
          <line x1={0} x2={VB_W} y1={base + 0.5} y2={base + 0.5} stroke="#e6ebf1" strokeWidth={1} />
        </svg>

        {/* brush */}
        <div
          className="absolute bottom-[22px] top-0 cursor-grab rounded-lg border-[1.5px] active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: 'rgba(33,130,191,.10)', borderColor: '#2182bf' }}
          onPointerDown={(e) => { if ((e.target as HTMLElement).dataset.handle) return; beginDrag(e, 'move') }}
        >
          <div data-handle="l" onPointerDown={(e) => beginDrag(e, 'l')}
            className="absolute left-[-6px] top-1/2 h-[34px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded bg-botscrew-500 shadow" />
          <div data-handle="r" onPointerDown={(e) => beginDrag(e, 'r')}
            className="absolute right-[-6px] top-1/2 h-[34px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded bg-botscrew-500 shadow" />
        </div>

        {/* season labels */}
        <div className="pointer-events-none absolute bottom-0.5 left-0 right-0 h-4">
          {labels.map((l, i) => (
            <span key={i} className="absolute -translate-x-1/2 text-[10px] font-semibold tracking-wide text-slate-400" style={{ left: `${l.f * 100}%` }}>{l.text}</span>
          ))}
        </div>
      </div>

      {/* controls */}
      <div className="mt-3.5 flex items-center gap-3.5">
        <button type="button" onClick={togglePlay}
          className="inline-flex items-center gap-1.5 rounded-lg bg-botscrew-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-botscrew-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold">
          {isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          {isPlaying ? 'Pause' : 'Play the year'}
        </button>
        <span className="text-sm font-semibold tabular-nums text-slate-700">{winLabel}</span>
      </div>
    </div>
  )
}
