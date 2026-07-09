import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ConversationExplorer } from '../ConversationExplorer'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { UrgencyProps } from '../../types/analytics'

export type { UrgencyProps } from '../../types/analytics'

// Low (calm green) · Medium (gold) · High (orange) · Escalation (red) — a
// severity ramp so the bar reads left-to-right from routine to urgent.
const URGENCY_COLOR: Record<string, string> = {
  Low: '#2E9B6B',
  Medium: '#F3B116',
  High: '#DC5B3B',
  'Escalation Required': '#E05252',
}
const colorFor = (label: string) => URGENCY_COLOR[label] ?? '#94A3B8'

/**
 * § "Needs attention" — the urgency mix from the AI enrichment (report.intel_urgency).
 * The headline is how many conversations were URGENT (High + Escalation Required);
 * the bar shows the full Low→Escalation spread, and the callout isolates outright
 * escalations. Click any tier — bar segment or legend — to read those exact
 * conversations (locked to that urgency in the explorer). Works on chat and voice.
 */
export function NeedsAttention({
  segments,
  total,
  urgent,
  urgentShare,
  escalation,
  className,
  botId,
  range,
  source = 'chat',
}: UrgencyProps & {
  className?: string
  botId?: number
  range?: { from: string; to: string }
  source?: 'chat' | 'voice'
}) {
  const [drill, setDrill] = useState<string | null>(null)
  const clickable = botId != null

  if (total === 0) {
    return (
      <Panel
        className={className}
        eyebrow="Service quality"
        title="Needs attention"
        description="How urgent each guest's need was — tagged by the AI on every substantive conversation."
      >
        <EmptyState title="No urgency data in range." message="Urgency is tagged by the AI on each substantive conversation." />
      </Panel>
    )
  }
  return (
    <Panel
      className={className}
      eyebrow="Service quality"
      title="Needs attention"
      description={
        clickable
          ? "How urgent each guest's need was — click a level to read those conversations."
          : "How urgent each guest's need was — the High and Escalation conversations are the ones worth a fast look."
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="shrink-0 sm:w-52">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold tabular-nums text-slate-900">{formatNumber(urgent)}</span>
            <span className="text-sm font-medium tabular-nums text-slate-400">{formatPercent(urgentShare)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">needed attention · High + Escalation</div>
          {escalation > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-sm">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span className="font-medium text-rose-700">{formatNumber(escalation)} escalation-level</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex h-6 w-full overflow-hidden rounded">
            {segments.map((s) =>
              s.conversations > 0 ? (
                clickable ? (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setDrill(s.label)}
                    title={`Read the ${s.label} conversations`}
                    className="h-full transition hover:opacity-80"
                    style={{ width: `${s.share * 100}%`, backgroundColor: colorFor(s.label) }}
                  />
                ) : (
                  <div
                    key={s.label}
                    title={`${s.label}: ${formatNumber(s.conversations)}`}
                    style={{ width: `${s.share * 100}%`, backgroundColor: colorFor(s.label) }}
                  />
                )
              ) : null,
            )}
          </div>
          <ul className="mt-3 space-y-1.5">
            {segments.map((s) => {
              const inner = (
                <>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(s.label) }} />
                  <span className="min-w-0 flex-1 truncate text-left text-slate-600">{s.label}</span>
                  <span className="tabular-nums text-slate-400">{formatPercent(s.share)}</span>
                  <span className="w-14 text-right font-medium tabular-nums text-slate-700">{formatNumber(s.conversations)}</span>
                </>
              )
              return (
                <li key={s.label}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => setDrill(s.label)}
                      className="flex w-full items-center gap-2 rounded text-sm transition hover:bg-slate-50"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {drill && botId != null && (
        <ConversationExplorer
          botId={botId}
          range={range}
          source={source}
          payload={{ botId, from: range?.from, to: range?.to, urgency: drill }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
