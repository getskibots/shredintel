import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { UserRound } from 'lucide-react'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { HumanHandoverProps } from '../../types/analytics'

export type { HumanHandoverProps } from '../../types/analytics'

// Handled by bot (neutral) · Possible (caution) · Clear (attention).
const COLORS = ['#94A3B8', '#F3B116', '#DC5B3B']

/**
 * § "Are we helping?" — human handover. The donut shows how often a person is
 * NEEDED (No / Possible / Clear handover, from the AI enrichment); the stats
 * show how often one ACTUALLY steps in (escalated) and the gap between them —
 * guests who clearly needed a human but never reached one.
 */
export function HumanHandover({
  segments,
  totalSubstantive,
  neededHumanShare,
  clearHandover,
  escalated,
  gap,
}: HumanHandoverProps) {
  if (totalSubstantive === 0) {
    return (
      <Panel eyebrow="Are we helping?" title="Human handover" description="How often guests need a person — and how often one actually steps in.">
        <EmptyState title="No handover data in range." message="Handover need is tagged by the AI on each substantive conversation." />
      </Panel>
    )
  }
  return (
    <Panel
      eyebrow="Are we helping?"
      title="Human handover"
      description="How often guests need a person — and how often one actually steps in."
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-44 w-44 shrink-0 sm:mx-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={segments} dataKey="conversations" nameKey="label" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
                {segments.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display text-2xl font-semibold tabular-nums text-slate-900">{formatPercent(neededHumanShare)}</div>
            <div className="text-[11px] text-slate-400">needed a human</div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <ul className="space-y-1.5">
            {segments.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate text-slate-600">{s.label}</span>
                <span className="tabular-nums text-slate-400">{formatPercent(s.share)}</span>
                <span className="w-14 text-right font-medium tabular-nums text-slate-700">{formatNumber(s.conversations)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Clearly needed a human</span>
              <span className="font-medium tabular-nums text-slate-800">{formatNumber(clearHandover)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">A human stepped in</span>
              <span className="font-medium tabular-nums text-slate-800">{formatNumber(escalated)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-rose-50 px-2.5 py-1.5">
              <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
                <UserRound className="h-3.5 w-3.5" /> Never reached a person
              </span>
              <span className="font-semibold tabular-nums text-rose-700">{formatNumber(gap)}</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
