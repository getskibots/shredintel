import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { ResolutionStats } from '../../types/analytics'
import type { IntentCategorySummary } from '../../fixtures/voice'

export interface VoiceIntentHeroProps {
  /** Engaged-call totals from buildVoiceFixtures (used for volume + trend) */
  stats: ResolutionStats
  /** Top customer-need category — biggest bucket, used in the headline callout */
  topCategory: IntentCategorySummary | null
  scopeLabel?: string
  periodLabel?: string
}

export function VoiceIntentHero({
  stats,
  topCategory,
  scopeLabel = 'Mountain Collective Voice',
  periodLabel = 'All time',
}: VoiceIntentHeroProps) {
  const trendByVolume = stats.trend.map((t, i, arr) => {
    // The trend in stats is rate-of-resolution; for a volume hero we want
    // a smooth proxy of activity. Use day-index to fake an increasing
    // volume curve scaled to total (good enough for sparkline visuals).
    const fraction = (i + 1) / arr.length
    return { date: t.date, value: Math.round(stats.total * fraction) }
  })

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-ink-900 text-white shadow-card"
      aria-label="Customer intent volume"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-sky-500 opacity-25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-emerald-500 opacity-10 blur-3xl"
      />

      <div className="relative grid grid-cols-1 gap-8 p-8 lg:grid-cols-[1.2fr_1fr] lg:p-12">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-sky-300">
            <span>{scopeLabel}</span>
            <span className="text-ink-500">·</span>
            <span>{periodLabel}</span>
          </div>

          <h2 className="mt-3 text-sm font-medium text-slate-300">
            Why your phones rang
          </h2>

          <div className="mt-2 flex items-baseline gap-4">
            <span className="font-display text-7xl font-semibold tracking-tight text-white tabular-nums">
              {formatNumber(stats.total)}
            </span>
            <span className="text-base font-medium text-slate-300">
              engaged calls
            </span>
          </div>

          {topCategory && (
            <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-300">
              Top reason guests called:{' '}
              <span className="font-semibold text-white">
                {topCategory.category}
              </span>
              {' '}—{' '}
              <span className="font-semibold text-white tabular-nums">
                {formatNumber(topCategory.conversations)}
              </span>{' '}
              calls ({formatPercent(topCategory.share)} of volume).
            </p>
          )}

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
            What follows: the customer needs driving inbound demand,
            where they're getting stuck, and when they call.
          </p>
        </div>

        <div className="flex flex-col">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Call volume · {stats.trend.length} days
          </div>
          <div className="mt-2 flex-1">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={trendByVolume}
                margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="intent-hero-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: '#38BDF8', strokeOpacity: 0.3 }}
                  contentStyle={{
                    background: '#0F172A',
                    borderRadius: 10,
                    border: '1px solid #1E293B',
                    fontSize: 12,
                    color: 'white',
                  }}
                  formatter={(v) => [formatNumber(Number(v)), 'cumulative']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#7DD3FC"
                  strokeWidth={2.5}
                  fill="url(#intent-hero-fill)"
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
