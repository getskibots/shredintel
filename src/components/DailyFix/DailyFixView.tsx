import { useMemo } from 'react'
import { useFleetDailyFix, type DailyFixRow } from '../../data/useFleetDailyFix'
import { Metric } from '../shared/Metric'

/**
 * "The Daily Fix" — the fleet's daily heartbeat. Reads report.fleet_daily_fix
 * (last complete day) and lays out mood, signal, top asks and the fun flavor
 * tags. Aggregate-only; this is also the source the public ski-weather image
 * will draw from.
 */

const fmt = (n: number) => n.toLocaleString('en-US')
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const FLAVOR_EMOJI: Record<string, string> = {
  funny: '😂', wholesome: '🥰', heartfelt: '❤️', furious: '😤', confused: '😕',
  bizarre: '🛸', frustrated: '😖', grateful: '🙏', excited: '🤩', anxious: '😰',
}
const flavorEmoji = (f: string) => FLAVOR_EMOJI[f.toLowerCase()] ?? '✨'

/** A playful "conditions" read from the sentiment mix — the weather seed. */
function conditions(r: DailyFixRow): { emoji: string; label: string } {
  const s = r.substantive || 1
  const pos = r.positive / s
  const neg = r.negative / s
  if (neg >= 0.12) return { emoji: '🌧️', label: 'Unsettled' }
  if (pos >= 0.28) return { emoji: '☀️', label: 'Bluebird' }
  if (pos >= 0.18) return { emoji: '🌤️', label: 'Mostly sunny' }
  return { emoji: '⛅', label: 'Partly cloudy' }
}

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** A stacked proportion bar for the sentiment mix. */
function MoodBar({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1
  const p = (n: number) => `${(100 * n) / total}%`
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
      <div className="bg-emerald-400" style={{ width: p(pos) }} title={`${pos} positive`} />
      <div className="bg-slate-300" style={{ width: p(neu) }} title={`${neu} neutral`} />
      <div className="bg-rose-400" style={{ width: p(neg) }} title={`${neg} negative`} />
    </div>
  )
}

export function DailyFixView() {
  const { today, prev, isLive, isLoading } = useFleetDailyFix()

  const delta = useMemo(() => {
    if (!today || !prev || prev.conversations === 0) return null
    return (today.conversations - prev.conversations) / prev.conversations
  }, [today, prev])

  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">Loading the fix…</div>
  if (!isLive || !today) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        No daily data yet — the nightly roll-up hasn’t produced a complete day.
      </div>
    )
  }

  const r = today
  const cond = conditions(r)
  const posPct = r.substantive ? Math.round((100 * r.positive) / r.substantive) : 0
  const resolvedPct = r.substantive ? Math.round((100 * r.resolved) / r.substantive) : 0
  const topCats = Object.entries(r.categories).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const catMax = topCats.length ? topCats[0][1] : 1
  const flavors = Object.entries(r.flavors).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const spend = r.twilio_usd + r.openai_usd

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Header + today's "conditions" */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">The Daily Fix</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Across all resorts · {dayLabel(r.day)}
            {isLive ? ' · live' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <span className="text-2xl" aria-hidden>{cond.emoji}</span>
          <div className="leading-tight">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Today’s read</div>
            <div className="font-display text-base font-semibold text-slate-800">{cond.label}</div>
          </div>
        </div>
      </div>

      {/* Vital signs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Conversations"
          value={fmt(r.conversations)}
          tone="accent"
          subValue={delta === null ? `${fmt(r.chat_conversations)} chat · ${fmt(r.voice_conversations)} voice` : `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}% vs prior day`}
          title="Conversations opened across every bot on the last complete day"
        />
        <Metric label="Positive mood" value={`${posPct}%`} tone={posPct >= 20 ? 'good' : 'default'} subValue={`${fmt(r.positive)} of ${fmt(r.substantive)} enriched`} title="Share of substantive conversations tagged Positive" />
        <Metric label="Resolved" value={`${resolvedPct}%`} subValue={`${fmt(r.resolved)} resolved`} title="Share of substantive conversations the bot resolved" />
        <Metric label="Spend" value={usd(spend)} subValue={`Twilio ${usd(r.twilio_usd)} · AI ${usd(r.openai_usd)}`} title="Twilio + OpenAI cost for the day" />
      </div>

      {/* Mood + needs-attention */}
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Mood</h2>
            <span className="text-xs tabular-nums text-slate-400">
              <span className="text-emerald-600">{fmt(r.positive)} pos</span> · {fmt(r.neutral)} neu · <span className="text-rose-500">{fmt(r.negative)} neg</span>
            </span>
          </div>
          <MoodBar pos={r.positive} neu={r.neutral} neg={r.negative} />
          <p className="mt-2 text-xs text-slate-500">Guest sentiment across {fmt(r.substantive)} substantive conversations.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Needs attention</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-amber-50/60 p-3">
              <div className="font-display text-xl font-semibold tabular-nums text-amber-700">{fmt(r.high_urgency)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">High urgency</div>
            </div>
            <div className="rounded-xl bg-rose-50/60 p-3">
              <div className="font-display text-xl font-semibold tabular-nums text-rose-600">{fmt(r.negative)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Negative</div>
            </div>
            <div className="rounded-xl bg-botscrew-50/60 p-3">
              <div className="font-display text-xl font-semibold tabular-nums text-botscrew-700">{fmt(r.wanted_human)}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">Wanted a human</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top asks + flavor */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Top asks today</h2>
          {topCats.length === 0 ? (
            <p className="text-sm text-slate-400">No categories tagged yet.</p>
          ) : (
            <div className="space-y-2">
              {topCats.map(([cat, n]) => (
                <div key={cat}>
                  <div className="mb-0.5 flex items-center justify-between text-xs">
                    <span className="text-slate-600">{cat}</span>
                    <span className="tabular-nums text-slate-400">{fmt(n)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-botscrew-400" style={{ width: `${(100 * n) / catMax}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Flavor of the day</h2>
            <span className="text-xs text-slate-400">the fun stuff</span>
          </div>
          {flavors.length === 0 ? (
            <p className="text-sm text-slate-400">A quiet day — no standout moments tagged.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {flavors.map(([f, n]) => (
                <span key={f} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                  <span aria-hidden>{flavorEmoji(f)}</span>
                  <span className="capitalize text-slate-700">{f}</span>
                  <span className="tabular-nums text-slate-400">{fmt(n)}</span>
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">Enrichment-tagged moments — the raw material for the daily ski-weather image.</p>
        </div>
      </div>
    </div>
  )
}
