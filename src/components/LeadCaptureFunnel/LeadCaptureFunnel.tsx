import { EmptyState, Panel } from '../shared'
import { clampPercent, formatNumber, formatPercent } from '../../lib/formatters'
import type { LeadCaptureFunnelProps } from '../../types/analytics'

export type { LeadCaptureFunnelProps } from '../../types/analytics'

export function LeadCaptureFunnel({
  steps,
  engagementRate,
  contactCaptureRate,
  supportTouchedRate,
}: LeadCaptureFunnelProps) {
  const empty = !steps || steps.length === 0 || steps[0]?.count === 0
  const start = steps[0]?.count ?? 1

  return (
    <Panel
      eyebrow="§ 3 User Identity"
      title="Lead capture funnel"
      description="Lead visibility from chat traffic — aggregate counts only."
      action={
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Contact capture
          </div>
          <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-emerald-700">
            {formatPercent(contactCaptureRate)}
          </div>
        </div>
      }
    >
      {empty ? (
        <EmptyState
          title="Contact capture data is not available for this range."
          message="No chat traffic was recorded in the selected window."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {steps.map((step, i) => {
              const widthPct = clampPercent((step.count / start) * 100)
              const isFirst = i === 0
              const isLast = i === steps.length - 1
              return (
                <li key={step.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <span className="font-mono text-[10px] font-semibold text-slate-400">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {step.label}
                    </div>
                    <div className="flex items-baseline gap-3 text-right">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatNumber(step.count)}
                      </span>
                      <span className="w-12 text-right text-[11px] tabular-nums text-slate-500">
                        {formatPercent(step.shareOfStarted)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className={[
                        'h-full rounded-md transition-all',
                        isFirst
                          ? 'bg-slate-300'
                          : isLast
                            ? 'bg-gradient-to-r from-violet-500 to-violet-400'
                            : 'bg-gradient-to-r from-sky-500 to-sky-400',
                      ].join(' ')}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  {step.shareOfPreviousStep !== undefined && i > 0 && (
                    <div className="mt-1 text-[10px] tabular-nums text-slate-400">
                      {formatPercent(step.shareOfPreviousStep)} of previous step
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <div>
              <div className="font-semibold tabular-nums text-slate-700">
                {formatPercent(engagementRate)}
              </div>
              <div>Engagement rate</div>
            </div>
            <div>
              <div className="font-semibold tabular-nums text-emerald-700">
                {formatPercent(contactCaptureRate)}
              </div>
              <div>Contact capture</div>
            </div>
            <div>
              <div className="font-semibold tabular-nums text-violet-700">
                {formatPercent(supportTouchedRate)}
              </div>
              <div>Support touched</div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}
