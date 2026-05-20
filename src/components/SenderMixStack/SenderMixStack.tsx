import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { SenderMixStackProps } from '../../types/analytics'

export type { SenderMixStackProps } from '../../types/analytics'

export function SenderMixStack({ totals, data }: SenderMixStackProps) {
  const empty = totals.totalMessages === 0 || !data || data.length === 0
  const deflection = totals.botMessageShare >= 0.5 && totals.supportMessageShare < 0.05

  const action = deflection ? (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-2 text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
        Deflection signal
      </div>
      <div className="mt-0.5 text-sm font-semibold text-violet-700">
        Support &lt; {formatPercent(0.05)} of workload
      </div>
    </div>
  ) : undefined

  return (
    <Panel
      eyebrow="§ 2 Message Intelligence"
      title="Sender mix"
      description="Message workload split between bot, guest, and human support."
      action={action}
    >
      {empty ? (
        <EmptyState
          title="No message activity in selected range."
          message="Pick a window that contains conversations to see the workload split."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Bot messages"
              value={formatNumber(totals.botMessages)}
              subValue={formatPercent(totals.botMessageShare)}
              tone="accent"
            />
            <Metric
              label="Guest messages"
              value={formatNumber(totals.userMessages)}
              tone="neutral"
            />
            <Metric
              label="Support messages"
              value={formatNumber(totals.supportMessages)}
              subValue={formatPercent(totals.supportMessageShare)}
              tone="warn"
            />
            <Metric
              label="Msgs / engaged convo"
              value={totals.avgMessagesPerEngagedConversation.toFixed(1)}
              tone="default"
            />
          </div>

          <div className="mt-5 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatNumber(Number(value)),
                    String(name),
                  ]}
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Bar
                  dataKey="botMessages"
                  name="Bot"
                  stackId="mix"
                  fill="#0EA5E9"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="userMessages"
                  name="Guest"
                  stackId="mix"
                  fill="#94A3B8"
                />
                <Bar
                  dataKey="supportMessages"
                  name="Support"
                  stackId="mix"
                  fill="#7C3AED"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            A low support share with high bot share is a deflection win — the bot is
            absorbing volume that would otherwise require a human.
          </p>
        </>
      )}
    </Panel>
  )
}
