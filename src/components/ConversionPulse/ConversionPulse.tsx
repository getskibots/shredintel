import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import { chart } from '../../lib/chartTheme'
import {
  deltaTone,
  formatDelta,
  formatNumber,
  formatPercent,
} from '../../lib/formatters'
import type { ConversionPulseProps } from '../../types/analytics'

export type { ConversionPulseProps } from '../../types/analytics'

export function ConversionPulse({
  totalConverted,
  conversionShareOfTotal,
  conversionShareOfEngaged,
  convertedDelta,
  bestDay,
  timeline,
}: ConversionPulseProps) {
  const empty = !timeline || timeline.length === 0 || totalConverted === 0

  const action = convertedDelta !== undefined ? (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
        deltaTone(convertedDelta, true),
      ].join(' ')}
    >
      {formatDelta(convertedDelta)} vs. prior
    </span>
  ) : undefined

  return (
    <Panel
      eyebrow="Sales & conversion"
      title="Conversion pulse"
      description="Bot-attributed conversion activity from status=CONVERTED — a revenue-assist signal."
      action={action}
    >
      {empty ? (
        <EmptyState
          title="No bot-attributed conversions in selected range."
          message="Either no CONVERTED status was set this period, or the bot didn’t touch any converting conversations."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              label="Converted conversations"
              value={formatNumber(totalConverted)}
              subValue="status=CONVERTED"
              tone="accent"
            />
            <Metric
              label="Share of total"
              value={formatPercent(conversionShareOfTotal)}
              subValue="of all conversations"
              tone="default"
            />
            <Metric
              label="Share of engaged"
              value={formatPercent(conversionShareOfEngaged)}
              subValue="of guests who replied"
              tone="good"
            />
          </div>

          <div className="mt-5 h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timeline}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="date" {...chart.xAxis} />
                <Tooltip
                  {...chart.tooltip}
                  formatter={(value) => [
                    formatNumber(Number(value)),
                    'Conversions',
                  ]}
                />
                <Bar dataKey="convertedConversations" {...chart.bar} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {bestDay && (
            <p className="mt-3 text-xs text-slate-500">
              Best day: <span className="font-semibold text-slate-700">{bestDay.date}</span>{' '}
              with{' '}
              <span className="font-semibold tabular-nums text-sky-700">
                {formatNumber(bestDay.convertedConversations)}
              </span>{' '}
              converted conversations.
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
