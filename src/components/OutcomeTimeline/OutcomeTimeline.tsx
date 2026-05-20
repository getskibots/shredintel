import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import {
  deltaTone,
  formatDelta,
  formatNumber,
  formatPercent,
} from '../../lib/formatters'
import type { OutcomeTimelineProps } from '../../types/analytics'

export type { OutcomeTimelineProps } from '../../types/analytics'

export function OutcomeTimeline({ data, totals }: OutcomeTimelineProps) {
  const empty = !data || data.length === 0 || totals.totalConversations === 0

  const action = totals.engagementRateDelta !== undefined ? (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
        Engagement rate
      </div>
      <div className="mt-0.5 flex items-baseline justify-end gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums text-sky-700">
          {formatPercent(totals.engagementRate)}
        </span>
        <span
          className={[
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            deltaTone(totals.engagementRateDelta, true),
          ].join(' ')}
        >
          {formatDelta(totals.engagementRateDelta)}
        </span>
      </div>
    </div>
  ) : undefined

  return (
    <Panel
      eyebrow="§ 1 Conversation Core"
      title="Conversation outcome timeline"
      description="Are guest conversations improving or degrading over time?"
      action={action}
    >
      {empty ? (
        <EmptyState
          title="No conversations in selected range."
          message="Adjust the date range above to see the outcome timeline."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric
              label="Total conversations"
              value={formatNumber(totals.totalConversations)}
            />
            <Metric
              label="Solved"
              value={formatNumber(totals.solved)}
              subValue={formatPercent(totals.solved / totals.totalConversations)}
              tone="good"
            />
            <Metric
              label="Unengaged"
              value={formatNumber(totals.unengaged)}
              subValue={formatPercent(totals.unengaged / totals.totalConversations)}
              tone="neutral"
            />
            <Metric
              label="Failed"
              value={formatNumber(totals.failed)}
              subValue={
                totals.failedDelta !== undefined
                  ? formatDelta(totals.failedDelta)
                  : formatPercent(totals.failed / totals.totalConversations)
              }
              tone="risk"
            />
            <Metric
              label="Resolution rate of engaged"
              value={formatPercent(totals.resolutionRateOfEngaged)}
              tone="accent"
            />
          </div>

          <div className="mt-6 h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="ot-solved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="ot-unengaged" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#94A3B8" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="ot-failed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#0EA5E9', fontSize: 11 }}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const v = Number(value)
                    if (name === 'Engagement rate' || name === 'engagementRate') {
                      return [formatPercent(v), 'Engagement rate']
                    }
                    return [formatNumber(v), String(name)]
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  stackId="outcomes"
                  dataKey="solved"
                  name="Solved"
                  stroke="#10B981"
                  fill="url(#ot-solved)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  stackId="outcomes"
                  dataKey="failed"
                  name="Failed"
                  stroke="#F43F5E"
                  fill="url(#ot-failed)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  stackId="outcomes"
                  dataKey="unengaged"
                  name="Unengaged"
                  stroke="#94A3B8"
                  fill="url(#ot-unengaged)"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="engagementRate"
                  name="Engagement rate"
                  stroke="#0EA5E9"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">UNENGAGED</span> means the guest
            didn’t reply — separate from <span className="font-semibold text-rose-700">FAILED</span>,
            where the bot couldn’t resolve an engaged conversation.
          </p>
        </>
      )}
    </Panel>
  )
}
