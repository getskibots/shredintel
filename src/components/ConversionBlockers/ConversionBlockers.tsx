import { BreakdownBars } from '../BreakdownBars'
import { EmptyState, Metric, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { ConversionBlockersProps } from '../../types/analytics'

export type { ConversionBlockersProps } from '../../types/analytics'

/**
 * § 2 — ecommerce / account conversion blockers (cross-cutting pinchpoints).
 * Where guests get stuck in the buy + account flow. Sourced from
 * report.intel_pinchpoint (ShredIntel enrichment).
 */
export function ConversionBlockers({
  blockers,
  affectedConversations,
  affectedShare,
}: ConversionBlockersProps) {
  const empty = !blockers || blockers.length === 0
  return (
    <Panel
      eyebrow="§ 2 Message Intelligence"
      title="Ecommerce conversion blockers"
      description="Where guests get stuck in the buy + account flow — the friction that costs sales."
    >
      {empty ? (
        <EmptyState
          title="No conversion blockers detected in range."
          message="No account/checkout friction surfaced for this period."
        />
      ) : (
        <>
          <div className="mb-4">
            <Metric
              label="Conversations hitting a blocker"
              value={formatNumber(affectedConversations)}
              subValue={`${formatPercent(affectedShare)} of substantive conversations`}
              tone="warn"
            />
          </div>
          <BreakdownBars items={blockers} tone="warn" max={12} />
        </>
      )}
    </Panel>
  )
}
