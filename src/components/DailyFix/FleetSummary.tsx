import type { ReactNode } from 'react'
import type { FleetFixSummary } from '../../data/useFleetFix'
import type { DrillTarget } from './FleetDrill'

type OnDrill = (t: DrillTarget) => void

/**
 * The Master'Botter "heartbeat" summary — mood, needs-attention, top asks and the
 * fun flavor tags — for whatever date range the picker is on (All time by default,
 * or a single day when the Daily Fix button is hit). Aggregate-only; this is also
 * the source the public ski-weather image will draw from.
 */

const fmt = (n: number) => n.toLocaleString('en-US')

const FLAVOR_EMOJI: Record<string, string> = {
  funny: '😂', wholesome: '🥰', heartfelt: '❤️', furious: '😤', confused: '😕',
  bizarre: '🛸', frustrated: '😖', grateful: '🙏', excited: '🤩', anxious: '😰', quirky: '🤪',
}
const flavorEmoji = (f: string) => FLAVOR_EMOJI[f.toLowerCase()] ?? '✨'

/** A playful "conditions" read from the sentiment mix — the weather seed. */
export function conditions(s: FleetFixSummary): { emoji: string; label: string } {
  const t = s.substantive || 1
  const pos = s.positive / t
  const neg = s.negative / t
  if (neg >= 0.12) return { emoji: '🌧️', label: 'Unsettled' }
  if (pos >= 0.28) return { emoji: '☀️', label: 'Bluebird' }
  if (pos >= 0.18) return { emoji: '🌤️', label: 'Mostly sunny' }
  return { emoji: '⛅', label: 'Partly cloudy' }
}

function MoodBar({ pos, neu, neg, onDrill }: { pos: number; neu: number; neg: number; onDrill?: OnDrill }) {
  const total = pos + neu + neg || 1
  const p = (n: number) => `${(100 * n) / total}%`
  const seg = (sentiment: string, label: string) => (onDrill ? () => onDrill({ dim: 'sentiment', value: sentiment, label }) : undefined)
  const cls = onDrill ? ' cursor-pointer transition hover:brightness-95' : ''
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
      <div className={'bg-emerald-400' + cls} style={{ width: p(pos) }} title={`${pos} positive`} onClick={seg('Positive', 'Positive conversations')} />
      <div className={'bg-slate-300' + cls} style={{ width: p(neu) }} title={`${neu} neutral`} onClick={seg('Neutral', 'Neutral conversations')} />
      <div className={'bg-rose-400' + cls} style={{ width: p(neg) }} title={`${neg} negative`} onClick={seg('Negative', 'Negative conversations')} />
    </div>
  )
}

/** A tile/chip that becomes a button when a drill handler is present. */
function Drillable({ onClick, className, children }: { onClick?: () => void; className: string; children: ReactNode }) {
  if (!onClick) return <div className={className}>{children}</div>
  return (
    <button type="button" onClick={onClick} className={className + ' cursor-pointer text-left transition hover:ring-2 hover:ring-botscrew-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-botscrew-400'}>
      {children}
    </button>
  )
}

// Outcome palette (matches the SQL bucket model in build-fleet-fix-rpc.mjs).
const OUTCOME = {
  ai_solved:  { color: '#10B981', label: 'Solved by AI',  sub: 'resolved, no human' },
  needs_human:{ color: '#F59E0B', label: 'Needed a human', sub: 'handed to a person' },
  unresolved: { color: '#CBD5E1', label: 'Unresolved',     sub: 'no clear outcome' },
} as const

/** Segmented donut. Segments render clockwise from 12 o'clock; center holds children. */
function Donut({ segments, size = 128, stroke = 15, children }: { segments: { value: number; color: string }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        {segments.map((sgm, i) => {
          const frac = sgm.value / total
          const dash = Math.max(0, frac * circ - 1) // tiny gap between arcs
          const off = -acc * circ
          acc += frac
          return (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={sgm.color} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={off}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/**
 * The fleet value-proposition card — the single most important thing to know
 * across every bot: how much the AI resolves with NO human. Hero = % solved by
 * AI; three drillable slices; the leftover attention signals (negative /
 * high-urgency) live as small drillable chips in the footer.
 */
function WhoSolvedIt({ s, onDrill }: { s: FleetFixSummary; onDrill?: OnDrill }) {
  const total = s.ai_solved + s.needs_human + s.unresolved_open || 1
  const aiPct = Math.round((100 * s.ai_solved) / total)
  const segs = [
    { key: 'ai_solved', value: s.ai_solved },
    { key: 'needs_human', value: s.needs_human },
    { key: 'unresolved', value: s.unresolved_open },
  ] as const
  const pct = (n: number) => `${Math.round((100 * n) / total)}%`
  const drill = (k: keyof typeof OUTCOME) => onDrill && (() => onDrill({ dim: 'outcome', value: k, label: OUTCOME[k].label }))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Who solved it</h2>
        <span className="text-xs text-slate-400">AI vs. human, all bots</span>
      </div>
      <div className="flex items-center gap-5">
        <Donut segments={segs.map((x) => ({ value: x.value, color: OUTCOME[x.key].color }))}>
          <div className="font-display text-2xl font-bold tabular-nums leading-none text-slate-800">{aiPct}%</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">solved by AI</div>
        </Donut>
        <div className="min-w-0 flex-1 space-y-1">
          {segs.map((x) => {
            const o = OUTCOME[x.key]
            return (
              <Drillable key={x.key} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5" onClick={drill(x.key)}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: o.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-700">{o.label}</span>
                  <span className="block text-[11px] text-slate-400">{o.sub}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-slate-800">{fmt(x.value)}</span>
                  <span className="block text-[11px] tabular-nums text-slate-400">{pct(x.value)}</span>
                </span>
              </Drillable>
            )
          })}
        </div>
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="font-semibold text-emerald-600">{fmt(s.ai_solved)}</span> conversations resolved with no human involved — support you didn’t have to staff.
      </p>
      {(s.negative > 0 || s.high_urgency > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Drillable className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]" onClick={onDrill && (() => onDrill({ dim: 'sentiment', value: 'Negative', label: 'Negative conversations' }))}>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span className="tabular-nums font-semibold text-slate-700">{fmt(s.negative)}</span>
            <span className="text-slate-500">negative</span>
          </Drillable>
          <Drillable className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]" onClick={onDrill && (() => onDrill({ dim: 'urgency', value: 'High', label: 'High urgency' }))}>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="tabular-nums font-semibold text-slate-700">{fmt(s.high_urgency)}</span>
            <span className="text-slate-500">high urgency</span>
          </Drillable>
        </div>
      )}
    </div>
  )
}

export function FleetSummary({ summary, isLoading, onDrill }: { summary: FleetFixSummary | null; isLoading: boolean; onDrill?: OnDrill }) {
  if (isLoading && !summary) {
    return <div className="mb-6 flex min-h-[120px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 shadow-sm">Reading the room…</div>
  }
  if (!summary || summary.substantive === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400 shadow-sm">
        No enriched conversations in this window.
      </div>
    )
  }
  const s = summary
  const cond = conditions(s)
  const posPct = s.substantive ? Math.round((100 * s.positive) / s.substantive) : 0
  const resolvedPct = s.substantive ? Math.round((100 * s.resolved) / s.substantive) : 0
  const topCats = Object.entries(s.categories).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const catMax = topCats.length ? topCats[0][1] : 1
  const flavors = Object.entries(s.flavors).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div className="mb-6 space-y-3">
      {/* Mood + conditions + needs-attention */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl" aria-hidden>{cond.emoji}</span>
              <div className="leading-tight">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Guest mood</div>
                <div className="font-display text-base font-semibold text-slate-800">{cond.label} · {posPct}% positive</div>
              </div>
            </div>
            <span className="text-xs tabular-nums text-slate-400">
              <span className="text-emerald-600">{fmt(s.positive)}</span> · {fmt(s.neutral)} · <span className="text-rose-500">{fmt(s.negative)}</span>
            </span>
          </div>
          <MoodBar pos={s.positive} neu={s.neutral} neg={s.negative} onDrill={onDrill} />
          <p className="mt-2 text-xs text-slate-500">Across {fmt(s.substantive)} substantive conversations · {resolvedPct}% resolved.</p>
        </div>
        <WhoSolvedIt s={s} onDrill={onDrill} />
      </div>

      {/* Top asks + flavor */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Top asks</h2>
          <div className="space-y-2">
            {topCats.map(([cat, n]) => (
              <Drillable key={cat} className="block w-full" onClick={onDrill && (() => onDrill({ dim: 'category', value: cat, label: cat }))}>
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className="text-slate-600">{cat}</span>
                  <span className="tabular-nums text-slate-400">{fmt(n)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-botscrew-400" style={{ width: `${(100 * n) / catMax}%` }} />
                </div>
              </Drillable>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Flavor</h2>
            <span className="text-xs text-slate-400">the fun stuff</span>
          </div>
          {flavors.length === 0 ? (
            <p className="text-sm text-slate-400">Quiet window — no standout moments tagged.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {flavors.map(([f, n]) => (
                <Drillable key={f} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm" onClick={onDrill && (() => onDrill({ dim: 'flavor', value: f, label: `${flavorEmoji(f)} ${f.charAt(0).toUpperCase() + f.slice(1)}` }))}>
                  <span aria-hidden>{flavorEmoji(f)}</span>
                  <span className="capitalize text-slate-700">{f}</span>
                  <span className="tabular-nums text-slate-400">{fmt(n)}</span>
                </Drillable>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
