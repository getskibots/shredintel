import { useState } from 'react'
import { BreakdownBars } from '../BreakdownBars'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import { KNOWLEDGE_LAYERS, GROUNDED_LAYERS, LAYER_COLOR } from '../../lib/knowledgeLayers'
import type {
  KnowledgeSectionDemandProps,
  KnowledgeLayersProps,
} from '../../types/analytics'

export type { KnowledgeSectionDemandProps } from '../../types/analytics'

const layerVal = (t: { layers: { layer: string; answers: number }[] }, name: string): number =>
  t.layers.find((l) => l.layer === name)?.answers ?? 0

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
  const [layerDrill, setLayerDrill] = useState<string | null>(null)
  const empty = !sections || sections.length === 0

  const ld = layers && layers.layers.length > 0 ? layers.layers : null
  const total = ld ? ld.reduce((s, l) => s + l.answers, 0) : 0
  const grounded = ld ? ld.filter((l) => GROUNDED_LAYERS.has(l.layer)).reduce((s, l) => s + l.answers, 0) : 0
  const groundingRate = total > 0 ? grounded / total : 0
  const solidGrounding = groundingRate >= 0.7
  const ordered = ld
    ? [...ld].sort((a, b) => KNOWLEDGE_LAYERS.indexOf(a.layer) - KNOWLEDGE_LAYERS.indexOf(b.layer))
    : []

  // Fill-list: topics ranked by "unbacked" answers (Instructions + Failed) — the
  // absolute volume of answers that would improve most from a grounded source.
  const fillList = (layers?.byTopic ?? [])
    .filter((t) => t.total > 0)
    .map((t) => {
      const unbacked = layerVal(t, 'Instructions') + layerVal(t, 'Failed')
      return { ...t, unbacked, backed: (t.total - unbacked) / t.total }
    })
    .sort((a, b) => b.unbacked - a.unbacked)
    .slice(0, 6)

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
                <span className="text-xs font-normal text-slate-400">
                  — by knowledge layer{botId ? ' · click a layer to read its chats' : ''}
                </span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-lg">
                {ordered.map((l) =>
                  l.answers > 0 ? (
                    <button
                      key={l.layer}
                      type="button"
                      onClick={botId ? () => setLayerDrill(l.layer) : undefined}
                      title={`${l.layer}: ${formatNumber(l.answers)} (${formatPercent(l.answers / total)})${botId ? ' — click to read these chats' : ''}`}
                      className={botId ? 'cursor-pointer transition hover:opacity-80' : ''}
                      style={{ width: `${(l.answers / total) * 100}%`, backgroundColor: LAYER_COLOR[l.layer] ?? '#94A3B8' }}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {ordered.map((l) => (
                  <button
                    key={l.layer}
                    type="button"
                    onClick={botId ? () => setLayerDrill(l.layer) : undefined}
                    title={botId ? `Read ${l.layer} chats` : undefined}
                    className={[
                      'inline-flex items-center gap-1.5 text-slate-600',
                      botId ? 'cursor-pointer rounded transition hover:text-slate-900' : 'cursor-default',
                    ].join(' ')}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LAYER_COLOR[l.layer] ?? '#94A3B8' }} />
                    {l.layer}{' '}
                    <span className="font-semibold tabular-nums text-slate-800">{formatPercent(l.answers / total)}</span>
                    <span className="tabular-nums text-slate-400">({formatNumber(l.answers)})</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {formatPercent(groundingRate)} of answers came from your own knowledge — Text Edits, Website, or Files.
                The rest fell back to the prompt (“Instructions”), with no source behind them — that’s where adding a
                Text Edit helps most.
              </p>
            </div>
          )}

          {fillList.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
                Topics to add content for
                <span className="text-xs font-normal text-slate-400">— most answers leaning on the prompt</span>
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Ranked by answers with no source behind them. Add a Text Edit (or page / file) to ground these — click a
                topic to read the chats.
              </p>
              <div className="space-y-1.5">
                {fillList.map((t) => (
                  <button
                    key={t.section}
                    type="button"
                    onClick={() => botId && setDrill(t.section)}
                    title={`Read ${t.section} chats`}
                    className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-slate-50"
                  >
                    <span className="w-40 shrink-0 truncate text-sm text-slate-700" title={t.section}>
                      {t.section}
                    </span>
                    <span className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      {KNOWLEDGE_LAYERS.map((name) => {
                        const v = layerVal(t, name)
                        return v > 0 ? (
                          <span
                            key={name}
                            style={{ width: `${(v / t.total) * 100}%`, backgroundColor: LAYER_COLOR[name] ?? '#94A3B8' }}
                          />
                        ) : null
                      })}
                    </span>
                    <span className="w-32 shrink-0 text-right text-xs">
                      <span className="font-semibold tabular-nums text-slate-700">{formatNumber(t.unbacked)}</span>
                      <span className="text-slate-400"> to ground · {formatPercent(t.backed)} backed</span>
                    </span>
                  </button>
                ))}
              </div>
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
      {layerDrill && botId && (
        <ConversationExplorer
          botId={botId}
          payload={{ botId, from: range?.from, to: range?.to, layer: layerDrill }}
          onClose={() => setLayerDrill(null)}
        />
      )}
    </Panel>
  )
}
