import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import {
  deltaTone,
  formatDelta,
  formatNumber,
  formatPercent,
} from '../../lib/formatters'
import type { GuestIdentitySplitProps } from '../../types/analytics'

export type { GuestIdentitySplitProps } from '../../types/analytics'

const COLORS = {
  known: '#0EA5E9',
  anon: '#94A3B8',
  contactable: '#10B981',
}

export function GuestIdentitySplit({
  totalConversations,
  knownGuests,
  anonymousGuests,
  contactableGuests,
  knownGuestRate,
  contactableGuestRate,
  knownGuestRateDelta,
  contactableGuestRateDelta,
}: GuestIdentitySplitProps) {
  const empty = totalConversations === 0

  const data = [
    { name: 'Known', value: knownGuests, color: COLORS.known },
    { name: 'Anonymous', value: anonymousGuests, color: COLORS.anon },
  ]

  return (
    <Panel
      eyebrow="§ 3 User Identity"
      title="Known vs anonymous guests"
      description="How much chat traffic can be tied to an identifiable or contactable guest? Aggregates only — no personal data."
    >
      {empty ? (
        <EmptyState
          title="Guest identity data is not available in this export."
          message="The selected window contains no conversations to summarize."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
          <div className="relative h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatNumber(Number(value)), 'guests']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="font-display text-xl font-semibold tabular-nums text-slate-900">
                {formatPercent(knownGuestRate)}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Known
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Metric
              label="Total conversations"
              value={formatNumber(totalConversations)}
              tone="default"
            />
            <Metric
              label="Known guests"
              value={formatNumber(knownGuests)}
              subValue={
                knownGuestRateDelta !== undefined ? (
                  <span className="inline-flex items-center gap-1">
                    {formatPercent(knownGuestRate)}
                    <span
                      className={[
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        deltaTone(knownGuestRateDelta, true),
                      ].join(' ')}
                    >
                      {formatDelta(knownGuestRateDelta)}
                    </span>
                  </span>
                ) : (
                  formatPercent(knownGuestRate)
                )
              }
              tone="accent"
            />
            <Metric
              label="Anonymous guests"
              value={formatNumber(anonymousGuests)}
              tone="neutral"
            />
            <Metric
              label="Contactable guests"
              value={formatNumber(contactableGuests)}
              subValue={
                contactableGuestRateDelta !== undefined ? (
                  <span className="inline-flex items-center gap-1">
                    {formatPercent(contactableGuestRate)}
                    <span
                      className={[
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        deltaTone(contactableGuestRateDelta, true),
                      ].join(' ')}
                    >
                      {formatDelta(contactableGuestRateDelta)}
                    </span>
                  </span>
                ) : (
                  formatPercent(contactableGuestRate)
                )
              }
              tone="good"
            />
          </div>
        </div>
      )}
    </Panel>
  )
}
