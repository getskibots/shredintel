import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import type { ResolutionStats } from '../../types/analytics'

export interface ResolutionHeroProps {
  stats: ResolutionStats
  /** Bot/resort label shown above the hero */
  scopeLabel?: string
  /** Period label, e.g. "Last 7 days" */
  periodLabel?: string
  /** Total greeted conversations — denominator for the engagement footnote */
  totalGreeted?: number
  /** Engagement rate (0-1), guests who replied to the bot */
  engagementRate?: number
}

function formatPct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

function formatDelta(current: number, previous: number) {
  const diff = current - previous
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${(diff * 100).toFixed(1)} pts`
}

export function ResolutionHero({
  stats,
  scopeLabel = 'Mountain Collective',
  periodLabel = 'Last 7 days',
  totalGreeted,
  engagementRate,
}: ResolutionHeroProps) {
  const delta = stats.rate - stats.ratePrevious
  const positive = delta >= 0

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-ink-900 text-white shadow-card"
      aria-label="Resolution rate"
    >
      {/* Glow accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-glacier-500 opacity-20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-summit-500 opacity-10 blur-3xl"
      />

      <div className="relative grid grid-cols-1 gap-8 p-8 lg:grid-cols-[1.2fr_1fr] lg:p-12">
        {/* Left: KPI */}
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-glacier-400">
            <span>{scopeLabel}</span>
            <span className="text-ink-500">·</span>
            <span>{periodLabel}</span>
          </div>

          <h2 className="mt-3 text-sm font-medium text-slate-300">
            Resolution rate{' '}
            <span className="text-slate-500">· of engaged conversations</span>
          </h2>

          <div className="mt-2 flex items-baseline gap-4">
            <span className="font-display text-7xl font-semibold tracking-tight text-white tabular-nums">
              {formatPct(stats.rate, 1)}
            </span>
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                positive
                  ? 'bg-success/15 text-success'
                  : 'bg-danger/15 text-danger',
              ].join(' ')}
              aria-label={`${positive ? 'Up' : 'Down'} ${Math.abs(delta * 100).toFixed(1)} percentage points vs prior period`}
            >
              <span aria-hidden>{positive ? '↑' : '↓'}</span>
              {formatDelta(stats.rate, stats.ratePrevious)}
            </span>
          </div>

          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
            <span className="font-semibold text-white tabular-nums">
              {stats.resolved.toLocaleString()}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-white tabular-nums">
              {stats.total.toLocaleString()}
            </span>{' '}
            engaged conversations resolved without human handoff.
          </p>

          {totalGreeted !== undefined && engagementRate !== undefined && (
            <div className="mt-5 inline-flex items-center gap-3 rounded-lg border border-summit-500/30 bg-summit-500/10 px-3 py-2 text-xs text-summit-400">
              <span aria-hidden>⚠</span>
              <span>
                Only{' '}
                <span className="font-semibold tabular-nums text-white">
                  {(engagementRate * 100).toFixed(1)}%
                </span>{' '}
                of{' '}
                <span className="font-semibold tabular-nums text-white">
                  {totalGreeted.toLocaleString()}
                </span>{' '}
                guests engaged. The bigger lever is the opener, not the answers.
              </span>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-lg bg-glacier-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-glacier-600">
              View unresolved
            </button>
            <button className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-ink-500 hover:bg-ink-800">
              Export report
            </button>
          </div>
        </div>

        {/* Right: Sparkline */}
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
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="#93C5FD"
                  strokeWidth={2.5}
                  fill="url(#heroFill)"
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
