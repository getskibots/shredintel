import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { BreakdownBars } from '../BreakdownBars'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type {
  KnowledgeSectionDemandProps,
  KnowledgeSourceLeaderboardProps,
} from '../../types/analytics'

export type { KnowledgeSectionDemandProps } from '../../types/analytics'

/**
 * Consolidated Knowledge card. Demand-by-topic (report.intel_section) is the
 * headline; answer coverage (report.knowledge_source_leaderboard — how many bot
 * answers came from a KB source vs. none) is folded in beneath it, with the
 * biggest knowledge gap called out top-right.
 *
 * The per-TOPIC coverage cut ("Tickets = 24% of demand but 40% unsourced")
 * lands in a follow-up (needs a topic×source joined view); for now coverage is
 * aggregate. The verbatim matched-entry leaderboard is demoted to an expander —
 * it reads as raw guest queries, so it largely duplicates the demand bars.
 */
export function KnowledgeSectionDemand({
  sections,
  coverage,
  botId,
  range,
}: KnowledgeSectionDemandProps & {
  coverage?: KnowledgeSourceLeaderboardProps
  botId?: number
  range?: { from: string; to: string }
}) {
  const [drill, setDrill] = useState<string | null>(null)
  const [showEntries, setShowEntries] = useState(false)
  const empty = !sections || sections.length === 0

  const total = coverage ? coverage.sourcedBotMessages + coverage.unsourcedBotMessages : 0
  const cov = coverage && total > 0 ? coverage : null
  const sourcedShare = cov && total > 0 ? cov.sourcedBotMessages / total : 0
  const heavyGap = (cov?.knowledgeGapRate ?? 0) > 0.3
  const maxEntry = cov ? Math.max(1, ...cov.topSources.map((s) => s.botMessageCount)) : 1

  return (
    <Panel
      eyebrow="Knowledge"
      title="What guests ask about"
      description="Every substantive chat mapped to a resort knowledge topic — plus how many answers came from your knowledge base vs. none at all. Click a topic to read the chats."
      action={
        cov ? (
          <div
            className={[
              'rounded-2xl px-4 py-2 text-right',
              heavyGap ? 'border border-amber-200 bg-amber-50/70' : 'border border-emerald-200 bg-emerald-50/70',
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
              {formatPercent(cov.knowledgeGapRate)}
            </div>
          </div>
        ) : undefined
      }
    >
      {empty ? (
        <EmptyState
          title="No enriched conversations in range."
          message="ShredIntel enrichment populates topic demand nightly."
        />
      ) : (
        <>
          <BreakdownBars items={sections} max={12} onSelect={botId ? setDrill : undefined} />

          {cov && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                Answer coverage
                <span className="text-xs font-normal text-slate-400">
                  — how many answers came from your knowledge base
                </span>
              </div>
              <div
                className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                title={`${formatPercent(sourcedShare)} of answers came from a KB source`}
              >
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${sourcedShare * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 text-xs">
                <span className="font-semibold text-emerald-700">
                  {formatNumber(cov.sourcedBotMessages)} sourced{' '}
                  <span className="font-normal text-slate-400">from a KB reference</span>
                </span>
                <span className="text-slate-500">
                  <span className="font-semibold text-slate-700">{formatNumber(cov.unsourcedBotMessages)}</span>{' '}
                  unsourced ({formatPercent(cov.knowledgeGapRate)})
                </span>
              </div>

              {cov.topSources.length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowEntries((s) => !s)}
                    aria-expanded={showEntries}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
                  >
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition ${showEntries ? 'rotate-90' : ''}`} />
                    Top answered entries
                    <span className="text-xs font-normal text-slate-400">({cov.topSources.length})</span>
                  </button>
                  {showEntries && (
                    <ul className="mt-3 space-y-2">
                      {cov.topSources.map((s) => (
                        <li
                          key={s.sourceName}
                          className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[16rem_1fr_auto]"
                        >
                          <div className="truncate text-sm text-slate-700" title={s.sourceName}>
                            {s.sourceName}
                          </div>
                          <div className="relative hidden h-4 overflow-hidden rounded bg-slate-100 sm:block">
                            <div
                              className="absolute inset-y-0 left-0 rounded bg-emerald-400"
                              style={{ width: `${(s.botMessageCount / maxEntry) * 100}%` }}
                            />
                          </div>
                          <div className="flex items-baseline gap-2 text-right">
                            <span className="text-sm font-semibold tabular-nums text-slate-700">
                              {formatNumber(s.botMessageCount)}
                            </span>
                            <span className="text-xs tabular-nums text-slate-400">
                              {formatPercent(s.shareOfAllBotMessages)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {drill && botId && (
        <ConversationExplorer
          botId={botId}
          range={range}
          filter={{ dim: 'section', value: drill, label: drill }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
