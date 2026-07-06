import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import { sentimentColors } from '../../lib/chartTheme'
import type { GuestSentimentProps } from '../../types/analytics'

export type { GuestSentimentProps } from '../../types/analytics'

/**
 * § 2 — overall guest sentiment split. Sourced from report.intel_sentiment.
 */
export function GuestSentiment({ positive, neutral, negative, total }: GuestSentimentProps) {
  const empty = total === 0
  const seg = [
    { label: 'Positive', v: positive, c: sentimentColors.positive },
    { label: 'Neutral', v: neutral, c: sentimentColors.neutral },
    { label: 'Negative', v: negative, c: sentimentColors.negative },
  ]
  return (
    <Panel
      eyebrow="Are we helping?"
      title="Guest sentiment"
      description="How guests felt across substantive conversations."
    >
      {empty ? (
        <EmptyState
          title="No sentiment in range."
          message="ShredIntel enrichment populates sentiment nightly."
        />
      ) : (
        <>
          <div className="flex h-6 w-full overflow-hidden rounded">
            {seg.map((s) =>
              s.v > 0 ? (
                <div
                  key={s.label}
                  style={{ width: `${(s.v / total) * 100}%`, backgroundColor: s.c }}
                  title={`${s.label}: ${s.v}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
            {seg.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.c }} />
                {s.label}{' '}
                <span className="font-semibold tabular-nums text-slate-800">
                  {formatNumber(s.v)}
                </span>{' '}
                ({formatPercent(total > 0 ? s.v / total : 0)})
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
