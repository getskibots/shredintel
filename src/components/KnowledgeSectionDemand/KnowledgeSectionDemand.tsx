import { useState } from 'react'
import { BreakdownBars } from '../BreakdownBars'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import type { KnowledgeSectionDemandProps } from '../../types/analytics'

export type { KnowledgeSectionDemandProps } from '../../types/analytics'

/**
 * § 2 — guest demand across the resort knowledge sections (topic taxonomy).
 * Sourced from report.intel_section. Click a section → its conversations.
 */
export function KnowledgeSectionDemand({ sections, botId, range }: KnowledgeSectionDemandProps & { botId?: number; range?: { from: string; to: string } }) {
  const [drill, setDrill] = useState<string | null>(null)
  const empty = !sections || sections.length === 0
  return (
    <Panel
      eyebrow="What guests ask about"
      title="Knowledge section demand"
      description="What guests ask about, mapped to your resort knowledge sections. Click a section to read the chats."
    >
      {empty ? (
        <EmptyState
          title="No enriched conversations in range."
          message="ShredIntel enrichment populates section demand nightly."
        />
      ) : (
        <BreakdownBars items={sections} max={12} onSelect={botId ? setDrill : undefined} />
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
