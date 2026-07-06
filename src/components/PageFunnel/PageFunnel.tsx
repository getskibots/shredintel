import { useState } from 'react'
import { MessagesSquare, Filter, X } from 'lucide-react'
import { Panel, EmptyState } from '../shared'
import { ConversationExplorer } from '../ConversationExplorer'
import { brand, sentimentColors } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { PageFunnelSummary } from '../../data/useAnalytics'

/**
 * "Where questions come from" — every substantive chat mapped to the page it
 * started on, arranged as an ecommerce funnel (Home → Checkout → Account). The
 * bar shows volume; the red sub-segment is the frustrated (negative) share, so
 * rising red deeper in the funnel = conversion friction to fix. Clicking a stage
 * sets the GLOBAL page filter (re-scopes the intelligence panels); the message
 * icon opens the real conversations from that stage.
 */
function frictionColor(share: number): string {
  if (share >= 0.15) return sentimentColors.negative // red — hot spot
  if (share >= 0.08) return '#D97706' // amber
  return brand.slate
}

export function PageFunnel({
  funnel,
  activeStage,
  onSelect,
  botId,
  range,
}: {
  funnel: PageFunnelSummary | null
  activeStage: string | null
  onSelect: (stage: string | null) => void
  botId: number
  range?: { from: string; to: string }
}) {
  const [drill, setDrill] = useState<string | null>(null)

  if (!funnel || funnel.stages.length === 0) {
    return (
      <Panel
        eyebrow="Sales & conversion"
        title="Where guest questions come from"
        description="Every substantive chat mapped to the site page it started on."
      >
        <EmptyState title="No page data in range." message="Page attribution needs the live page-funnel view for this bot and period." />
      </Panel>
    )
  }

  // The most frustrating stage with a meaningful sample — the headline takeaway.
  const peak = [...funnel.stages]
    .filter((s) => s.conversations >= 20)
    .sort((a, b) => b.negativeShare - a.negativeShare)[0]

  return (
    <Panel
      eyebrow="Sales & conversion"
      title="Where guest questions come from"
      description="Every substantive chat mapped to the site page it started on. The red slice is the frustrated share — where it grows is where the buy flow needs work."
      action={
        peak ? (
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Friction peaks at</div>
            <div className="text-sm font-semibold" style={{ color: frictionColor(peak.negativeShare) }}>
              {peak.stage} · {formatPercent(peak.negativeShare)} frustrated
            </div>
          </div>
        ) : undefined
      }
    >
      {activeStage && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-botscrew-200 bg-botscrew-50/70 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-botscrew-800">
            <Filter className="h-4 w-4" />
            <span>
              Dashboard filtered to <span className="font-semibold">{activeStage}</span> pages — the intelligence panels below
              show only questions that started here.
            </span>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-botscrew-700 shadow-sm transition hover:bg-botscrew-100"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {funnel.stages.map((s) => {
          const isActive = activeStage === s.stage
          const volPct = funnel.maxConversations > 0 ? (s.conversations / funnel.maxConversations) * 100 : 0
          const negPct = funnel.maxConversations > 0 ? (s.negative / funnel.maxConversations) * 100 : 0
          return (
            <div
              key={s.stage}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition ${
                isActive ? 'bg-botscrew-50 ring-1 ring-botscrew-300' : 'hover:bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(isActive ? null : s.stage)}
                title={isActive ? 'Clear page filter' : `Filter dashboard to ${s.stage} pages`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex w-36 shrink-0 items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                    {s.rank}
                  </span>
                  <span className={`truncate text-sm ${isActive ? 'font-semibold text-slate-900' : 'text-slate-700'}`} title={s.stage}>
                    {s.stage}
                  </span>
                </span>
                <span className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${volPct}%`, backgroundColor: brand.blue, opacity: 0.35 }} />
                  <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${negPct}%`, backgroundColor: sentimentColors.negative }} />
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">{formatNumber(s.conversations)}</span>
                <span
                  className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums"
                  style={{ color: frictionColor(s.negativeShare) }}
                  title="Frustrated (negative-sentiment) share"
                >
                  {formatPercent(s.negativeShare)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDrill(s.stage)}
                title={`Read the questions from ${s.stage} pages`}
                aria-label={`Read the questions from ${s.stage} pages`}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-white hover:text-botscrew-600"
              >
                <MessagesSquare className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between px-1.5 text-[11px] text-slate-400">
        <span>Bar = substantive chats · red = frustrated share · click a stage to filter the dashboard</span>
        <span className="tabular-nums">{formatNumber(funnel.totalConversations)} page-attributed</span>
      </div>

      {drill && (
        <ConversationExplorer
          botId={botId}
          range={range}
          filter={{ dim: 'stage', value: drill, label: drill }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
