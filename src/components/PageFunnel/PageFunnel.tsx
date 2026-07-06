import { useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { Panel, EmptyState } from '../shared'
import { ConversationExplorer } from '../ConversationExplorer'
import { brand, sentimentColors } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { PageFunnelSummary } from '../../data/useAnalytics'

/**
 * "Where guests get stuck — by page" — every substantive chat mapped to the
 * page it started on, arranged as an ecommerce funnel (Home → Checkout →
 * Account). The bar shows volume; the red sub-segment is the frustrated
 * (negative) share, so rising red deeper in the funnel = conversion friction to
 * fix. Clicking a stage drills to the real conversations from that stage — like
 * every other panel (no global dashboard filter).
 */
// Stages below this have too few chats for the frustrated % to be reliable
// (e.g. 27% of 11 chats = 3 people) — they're excluded from the headline peak
// and their % is muted so a tiny sample doesn't outshout a real hot spot.
const MIN_SAMPLE = 20

function frictionColor(share: number): string {
  if (share >= 0.15) return sentimentColors.negative // red — hot spot
  if (share >= 0.08) return '#D97706' // amber
  return brand.slate
}

// The page taxonomy stores the homepage as "Home" — spell it out in the UI so
// it's unmistakably the homepage, not a section. The underlying value stays
// "Home" everywhere (drill filter, AI grounding, DB), so only the label changes.
const STAGE_LABELS: Record<string, string> = { Home: 'Homepage' }
const stageLabel = (stage: string): string => STAGE_LABELS[stage] ?? stage

export function PageFunnel({
  funnel,
  botId,
  range,
  className,
}: {
  funnel: PageFunnelSummary | null
  botId: number
  range?: { from: string; to: string }
  className?: string
}) {
  const [drill, setDrill] = useState<string | null>(null)

  if (!funnel || funnel.stages.length === 0) {
    return (
      <Panel
        className={className}
        eyebrow="Sales & conversion"
        title="Where guests get stuck — by page"
        description="Every substantive chat mapped to the site page it started on."
      >
        <EmptyState title="No page data in range." message="Page attribution needs the live page-funnel view for this bot and period." />
      </Panel>
    )
  }

  // The most frustrating stage with a meaningful sample — the headline takeaway.
  const peak = [...funnel.stages]
    .filter((s) => s.conversations >= MIN_SAMPLE)
    .sort((a, b) => b.negativeShare - a.negativeShare)[0]

  return (
    <Panel
      className={className}
      eyebrow="Sales & conversion"
      title="Where guests get stuck — by page"
      description="Every substantive chat mapped to the site page it started on. The red slice is the frustrated share — where it grows is where the buy flow needs work."
      action={
        peak ? (
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Friction peaks at</div>
            <div className="text-sm font-semibold" style={{ color: frictionColor(peak.negativeShare) }}>
              {stageLabel(peak.stage)} · {formatPercent(peak.negativeShare)} frustrated
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {funnel.stages.map((s) => {
          const volPct = funnel.maxConversations > 0 ? (s.conversations / funnel.maxConversations) * 100 : 0
          const negPct = funnel.maxConversations > 0 ? (s.negative / funnel.maxConversations) * 100 : 0
          const lowSample = s.conversations < MIN_SAMPLE
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => setDrill(s.stage)}
              title={`Read the questions from ${stageLabel(s.stage)} pages`}
              className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-50"
            >
              <span className="flex w-36 shrink-0 items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                  {s.rank}
                </span>
                <span className="truncate text-sm text-slate-700" title={stageLabel(s.stage)}>
                  {stageLabel(s.stage)}
                </span>
              </span>
              <span className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${volPct}%`, backgroundColor: brand.blue, opacity: 0.35 }} />
                <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${negPct}%`, backgroundColor: sentimentColors.negative }} />
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">{formatNumber(s.conversations)}</span>
              <span
                className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums"
                style={{ color: lowSample ? '#94A3B8' : frictionColor(s.negativeShare) }}
                title={
                  lowSample
                    ? `Frustrated share — only ${formatNumber(s.conversations)} chats, too few to be reliable`
                    : 'Frustrated (negative-sentiment) share'
                }
              >
                {formatPercent(s.negativeShare)}
              </span>
              <MessagesSquare className="h-4 w-4 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between px-1.5 text-[11px] text-slate-400">
        <span>Bar = substantive chats · red = frustrated share · click a stage to read those questions</span>
        <span className="tabular-nums">{formatNumber(funnel.totalConversations)} page-attributed</span>
      </div>

      {drill && (
        <ConversationExplorer
          botId={botId}
          range={range}
          filter={{ dim: 'stage', value: drill, label: stageLabel(drill) }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
