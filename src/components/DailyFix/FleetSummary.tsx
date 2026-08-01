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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Needs attention</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Drillable className="rounded-xl bg-amber-50/60 p-3" onClick={onDrill && (() => onDrill({ dim: 'urgency', value: 'High', label: 'High urgency' }))}>
              <div className="font-display text-xl font-semibold tabular-nums text-amber-700">{fmt(s.high_urgency)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">High urgency</div>
            </Drillable>
            <Drillable className="rounded-xl bg-rose-50/60 p-3" onClick={onDrill && (() => onDrill({ dim: 'sentiment', value: 'Negative', label: 'Negative conversations' }))}>
              <div className="font-display text-xl font-semibold tabular-nums text-rose-600">{fmt(s.negative)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Negative</div>
            </Drillable>
            <Drillable className="rounded-xl bg-botscrew-50/60 p-3" onClick={onDrill && (() => onDrill({ dim: 'handover', value: '', label: 'Wanted a human' }))}>
              <div className="font-display text-xl font-semibold tabular-nums text-botscrew-700">{fmt(s.wanted_human)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Wanted a human</div>
            </Drillable>
          </div>
        </div>
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
