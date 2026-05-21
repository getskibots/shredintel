import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import type { ResolutionStats } from '../../types/analytics'
import { formatNumber, formatPercent, formatPercentSmart } from '../../lib/formatters'

export interface VoiceHeroProps {
  stats: ResolutionStats
  /** Resort / bot label */
  scopeLabel?: string
  /** Period label */
  periodLabel?: string
  /** Recorded human handoffs (live-agent escalations) for the period */
  humanHandoffs?: number
  /** Total calls — denominator for the handoff callout */
  totalCalls?: number
}

function formatDelta(current: number, previous: number) {
  const diff = current - previous
  const sign = diff >= 0 ? '+' : '−'
  return `${sign}${(Math.abs(diff) * 100).toFixed(1)} pts`
}

export function VoiceHero({
  stats,
  scopeLabel = 'Mountain Collective Voice',
  periodLabel = 'All time',
  humanHandoffs = 0,
  totalCalls,
}: VoiceHeroProps) {
  const delta = stats.rate - stats.ratePrevious
  const positive = delta >= 0
  const handoffShare =
    totalCalls && totalCalls > 0 ? humanHandoffs / totalCalls : 0

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-ink-900 text-white shadow-card"
      aria-label="AI resolution rate"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-emerald-500 opacity-20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-glacier-500 opacity-10 blur-3xl"
      />

      <div className="relative grid grid-cols-1 gap-8 p-8 lg:grid-cols-[1.2fr_1fr] lg:p-12">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-300">
            <span>{scopeLabel}</span>
            <span className="text-ink-500">·</span>
            <span>{periodLabel}</span>
          </div>

          <h2 className="mt-3 text-sm font-medium text-slate-300">
            AI containment rate{' '}
            <span className="text-slate-500">· of engaged calls</span>
          </h2>

          <div className="mt-2 flex items-baseline gap-4">
            <span className="font-display text-7xl font-semibold tracking-tight text-white tabular-nums">
              {formatPercentSmart(stats.rate)}
            </span>
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                positive
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300',
              ].join(' ')}
            >
              <span aria-hidden>{positive ? '↑' : '↓'}</span>
              {formatDelta(stats.rate, stats.ratePrevious)}
            </span>
          </div>

          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
            <span className="font-semibold text-white tabular-nums">
              {formatNumber(stats.resolved)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-white tabular-nums">
              {formatNumber(stats.total)}
            </span>{' '}
            engaged calls handled by the AI alone — no live-agent escalation.
          </p>

          <div className="mt-5 inline-flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <span aria-hidden>✓</span>
            <span>
              Only{' '}
              <span className="font-semibold tabular-nums text-white">
                {formatNumber(humanHandoffs)}
              </span>{' '}
              live-agent handoffs ({formatPercent(handoffShare, 2)} of engaged
              calls). The AI absorbed everything else.
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600">
              View call transcripts
            </button>
            <button className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-ink-500 hover:bg-ink-800">
              Export report
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {stats.trend.length}-day trend
          </div>
          <div className="mt-2 flex-1">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={stats.trend}
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="voiceHeroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="#6EE7B7"
                  strokeWidth={2.5}
                  fill="url(#voiceHeroFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>{stats.trend[0]?.date}</span>
            <span>{stats.trend[stats.trend.length - 1]?.date}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
