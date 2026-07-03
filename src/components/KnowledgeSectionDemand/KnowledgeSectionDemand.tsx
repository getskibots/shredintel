import { BreakdownBars } from '../BreakdownBars'
import { EmptyState, Panel } from '../shared'
import type { KnowledgeSectionDemandProps } from '../../types/analytics'

export type { KnowledgeSectionDemandProps } from '../../types/analytics'

/**
 * § 2 — guest demand across the resort knowledge sections (topic taxonomy).
 * Sourced from report.intel_section (ShredIntel enrichment).
 */
export function KnowledgeSectionDemand({ sections }: KnowledgeSectionDemandProps) {
  const empty = !sections || sections.length === 0
  return (
    <Panel
      eyebrow="§ 2 Message Intelligence"
      title="Knowledge section demand"
      description="What guests ask about, mapped to your resort knowledge sections."
    >
      {empty ? (
        <EmptyState
          title="No enriched conversations in range."
          message="ShredIntel enrichment populates section demand nightly."
        />
      ) : (
        <BreakdownBars items={sections} max={12} />
      )}
    </Panel>
  )
}
