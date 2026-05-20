import { EmptyState, Metric, Panel } from '../shared'
import {
  clampPercent,
  deltaTone,
  formatDelta,
  formatNumber,
  formatPercent,
} from '../../lib/formatters'
import type { KnowledgeSourceLeaderboardProps } from '../../types/analytics'

export type { KnowledgeSourceLeaderboardProps } from '../../types/analytics'

export function KnowledgeSourceLeaderboard({
  sourcedBotMessages,
  unsourcedBotMessages,
  knowledgeGapRate,
  topSources,
}: KnowledgeSourceLeaderboardProps) {
  const totalBot = sourcedBotMessages + unsourcedBotMessages
  const empty = totalBot === 0 || topSources.length === 0
  const heavyGap = knowledgeGapRate > 0.5
  const max = Math.max(1, ...topSources.map((s) => s.botMessageCount))

  const action = (
    <div
      className={[
        'rounded-2xl px-4 py-2 text-right',
        heavyGap
          ? 'border border-amber-200 bg-amber-50/70'
          : 'border border-emerald-200 bg-emerald-50/70',
      ].join(' ')}
    >
      <div
        className={[
          'text-[10px] font-semibold uppercase tracking-wider',
          heavyGap ? 'text-amber-700' : 'text-emerald-700',
        ].join(' ')}
      >
        Knowledge-gap rate
      </div>
      <div
        className={[
          'mt-0.5 font-display text-2xl font-semibold tabular-nums',
          heavyGap ? 'text-amber-700' : 'text-emerald-700',
        ].join(' ')}
      >
        {formatPercent(knowledgeGapRate)}
      </div>
    </div>
  )

  return (
    <Panel
      eyebrow="§ 2 Message Intelligence"
      title="Knowledge source leaderboard"
      description="Which content sources are powering the bot’s answers?"
      action={action}
    >
      {empty ? (
        <EmptyState
          title="Knowledge-source data is not available for this range."
          message="The bot hasn’t logged any sourced answers in the selected window."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              label="Sourced bot messages"
              value={formatNumber(sourcedBotMessages)}
              subValue="answered with a KB reference"
              tone="good"
            />
            <Metric
              label="Unsourced bot messages"
              value={formatNumber(unsourcedBotMessages)}
              subValue="no KB reference"
              tone={heavyGap ? 'warn' : 'neutral'}
            />
            <Metric
              label="Top source covers"
              value={formatPercent(topSources[0]?.shareOfSourcedMessages ?? 0)}
              subValue={`of sourced answers`}
              tone="accent"
            />
          </div>

          {heavyGap && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong className="font-semibold">⚠ Over half of bot answers</strong> have
              no KB source. The "Knowledge gaps" panel above shows the biggest fill-in
              opportunities.
            </div>
          )}

          <ul className="mt-5 space-y-3">
            {topSources.map((s) => {
              const w = (s.botMessageCount / max) * 100
              return (
                <li
                  key={s.sourceName}
                  className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-center"
                >
                  <div className="truncate text-sm font-medium text-slate-800" title={s.sourceName}>
                    {s.sourceName}
                  </div>
                  <div className="relative h-6 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="absolute left-0 top-0 h-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-400"
                      style={{ width: `${clampPercent(w)}%` }}
                    />
                  </div>
                  <div className="flex items-baseline justify-end gap-2 text-right">
                    <span className="text-sm font-semibold tabular-nums text-slate-700">
                      {formatNumber(s.botMessageCount)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatPercent(s.shareOfAllBotMessages)}
                    </span>
                    {s.delta !== undefined && (
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          deltaTone(s.delta, true),
                        ].join(' ')}
                      >
                        {formatDelta(s.delta)}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
