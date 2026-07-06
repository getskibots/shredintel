import { useState } from 'react'
import { BreakdownBars } from '../BreakdownBars'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type {
  KnowledgeSectionDemandProps,
  KnowledgeLayersProps,
} from '../../types/analytics'

export type { KnowledgeSectionDemandProps } from '../../types/analytics'

// The Botscrew "Knowledge Layers" the resort manages, + Failed. Grounded =
// answered from an actual retrieved source (Text Edits / Website / Files);
// Instructions = answered from the prompt with no retrieved entry.
const LAYER_ORDER = ['Text Edits', 'Website', 'Files', 'Instructions', 'Failed']
const LAYER_COLOR: Record<string, string> = {
  'Text Edits': '#1D9E75', // teal — curated Q&A knowledge
  Website: '#2182BF', // brand blue — crawled pages
  Files: '#EF9F27', // amber — uploaded docs
  Instructions: '#7F77DD', // purple — prompt-only (no retrieved source)
  Failed: '#DC5B3B', // coral — couldn't answer
}
const GROUNDED = new Set(['Text Edits', 'Website', 'Files'])

/**
 * Consolidated Knowledge card. Demand-by-topic (report.intel_section) is the
 * headline; "Where answers come from" — the mix of Botscrew Knowledge Layers
 * (report.knowledge_layer_mix) — sits beneath it, with the grounding rate
 * called out top-right.
 *
 * Grounding rate = share answered from a real retrieved source (Text Edits +
 * Website + Files) vs. the prompt alone (Instructions) or a failure. Per-TOPIC
 * layer mix + per-source drill land in a follow-up pass.
 */
export function KnowledgeSectionDemand({
  sections,
  layers,
  botId,
  range,
}: KnowledgeSectionDemandProps & {
  layers?: KnowledgeLayersProps
  botId?: number
  range?: { from: string; to: string }
}) {
  const [drill, setDrill] = useState<string | null>(null)
  const empty = !sections || sections.length === 0

  const ld = layers && layers.layers.length > 0 ? layers.layers : null
  const total = ld ? ld.reduce((s, l) => s + l.answers, 0) : 0
  const grounded = ld ? ld.filter((l) => GROUNDED.has(l.layer)).reduce((s, l) => s + l.answers, 0) : 0
  const groundingRate = total > 0 ? grounded / total : 0
  const solidGrounding = groundingRate >= 0.7
  const ordered = ld
    ? [...ld].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer))
    : []

  return (
    <Panel
      eyebrow="Knowledge"
      title="What guests ask about"
      description="Every substantive chat mapped to a resort knowledge topic — plus which knowledge layer answered it (Text Edits, Website, Files, or the prompt). Click a topic to read the chats."
      action={
        ld ? (
          <div
            className={[
              'rounded-2xl px-4 py-2 text-right',
              solidGrounding ? 'border border-emerald-200 bg-emerald-50/70' : 'border border-amber-200 bg-amber-50/70',
            ].join(' ')}
          >
            <div
              className={[
                'text-[10px] font-semibold uppercase tracking-wider',
                solidGrounding ? 'text-emerald-700' : 'text-amber-700',
              ].join(' ')}
            >
              Answered from your content
            </div>
            <div
              className={[
                'mt-0.5 font-display text-2xl font-semibold tabular-nums',
                solidGrounding ? 'text-emerald-700' : 'text-amber-700',
              ].join(' ')}
            >
              {formatPercent(groundingRate)}
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

          {ld && total > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                Where answers come from
                <span className="text-xs font-normal text-slate-400">— by knowledge layer</span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-lg">
                {ordered.map((l) =>
                  l.answers > 0 ? (
                    <div
                      key={l.layer}
                      title={`${l.layer}: ${formatNumber(l.answers)} (${formatPercent(l.answers / total)})`}
                      style={{ width: `${(l.answers / total) * 100}%`, backgroundColor: LAYER_COLOR[l.layer] ?? '#94A3B8' }}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {ordered.map((l) => (
                  <span key={l.layer} className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LAYER_COLOR[l.layer] ?? '#94A3B8' }} />
                    {l.layer}{' '}
                    <span className="font-semibold tabular-nums text-slate-800">{formatPercent(l.answers / total)}</span>
                    <span className="tabular-nums text-slate-400">({formatNumber(l.answers)})</span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {formatPercent(groundingRate)} of answers came from your own knowledge — Text Edits, Website, or Files.
                The rest fell back to the prompt (“Instructions”), with no source behind them — that’s where adding a
                Text Edit helps most.
              </p>
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
