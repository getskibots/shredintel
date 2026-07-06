import { useState } from 'react'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import { sentimentColors } from '../../lib/chartTheme'
import type { GuestSentimentProps } from '../../types/analytics'

export type { GuestSentimentProps } from '../../types/analytics'

/**
 * Overall guest sentiment split (from report.intel_sentiment). Click a sentiment
 * — bar segment or legend — to drill to those conversations (locked to that
 * sentiment in the explorer).
 */
export function GuestSentiment({
  positive,
  neutral,
  negative,
  total,
  botId,
  range,
}: GuestSentimentProps & { botId?: number; range?: { from: string; to: string } }) {
  const [drill, setDrill] = useState<string | null>(null)
  const empty = total === 0
  const seg = [
    { label: 'Positive', v: positive, c: sentimentColors.positive },
    { label: 'Neutral', v: neutral, c: sentimentColors.neutral },
    { label: 'Negative', v: negative, c: sentimentColors.negative },
  ]
  const clickable = botId != null

  return (
    <Panel
      eyebrow="Service quality"
      title="Guest sentiment"
      description="How guests felt across substantive conversations. Click a sentiment to read those chats."
    >
      {empty ? (
        <EmptyState title="No sentiment in range." message="ShredIntel enrichment populates sentiment nightly." />
      ) : (
        <>
          <div className="flex h-6 w-full overflow-hidden rounded">
            {seg.map((s) =>
              s.v > 0 ? (
                clickable ? (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setDrill(s.label)}
                    title={`Read the ${s.label.toLowerCase()} conversations`}
                    className="h-full transition hover:opacity-80"
                    style={{ width: `${(s.v / total) * 100}%`, backgroundColor: s.c }}
                  />
                ) : (
                  <div key={s.label} style={{ width: `${(s.v / total) * 100}%`, backgroundColor: s.c }} title={`${s.label}: ${s.v}`} />
                )
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
            {seg.map((s) => {
              const inner = (
                <>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.c }} />
                  {s.label}{' '}
                  <span className="font-semibold tabular-nums text-slate-800">{formatNumber(s.v)}</span>{' '}
                  ({formatPercent(total > 0 ? s.v / total : 0)})
                </>
              )
              return clickable ? (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setDrill(s.label)}
                  className="inline-flex items-center gap-1.5 rounded transition hover:text-slate-900"
                >
                  {inner}
                </button>
              ) : (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  {inner}
                </span>
              )
            })}
          </div>
        </>
      )}
      {drill && botId != null && (
        <ConversationExplorer
          botId={botId}
          range={range}
          payload={{ botId, from: range?.from, to: range?.to, sentiment: drill }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
