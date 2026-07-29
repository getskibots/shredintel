import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import { brand, chart } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { DemandRhythmProps } from '../../types/analytics'

export type { DemandRhythmProps } from '../../types/analytics'

/** 0→"12a", 9→"9a", 12→"12p", 23→"11p" (resort-local). */
function fmtHour(h: number): string {
  const suffix = h < 12 ? 'a' : 'p'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}${suffix}`
}

const DAY_FULL: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
}

export function DemandRhythm({
  hourly,
  byDay,
  workingConversations,
  afterHoursConversations,
  afterHoursShare,
  peakHour,
  peakDay,
}: DemandRhythmProps) {
  const total = workingConversations + afterHoursConversations
  const empty = total === 0 || hourly.every((h) => h.conversations === 0)

  if (empty) {
    return (
      <Panel
        eyebrow="Your guests"
        title="When your guests reach out"
        description="The hours and days your guests actually show up — and how much lands after hours."
      >
        <EmptyState
          title="Time-of-day analysis is unavailable."
          message="No conversations with resort-local timestamps in this range."
        />
      </Panel>
    )
  }

  // Donut: highlight after-hours (the coverage story) in gold, working in blue.
  const donut = [
    { name: 'After hours', value: afterHoursConversations, color: brand.gold },
    { name: 'Working hours', value: workingConversations, color: brand.blue },
  ]

  const action = (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
        After-hours demand
      </div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-amber-700">
        {formatPercent(afterHoursShare)}
      </div>
    </div>
  )

  return (
    <Panel
      eyebrow="Your guests"
      title="When your guests reach out"
      description="The hours and days your guests actually show up — and how much lands after hours, when only the bot is awake."
      action={action}
    >
      {/* Band 1 — coverage donut + headline metrics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <div className="relative h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donut}
                dataKey="value"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {donut.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: `1px solid ${brand.axisLine}`, fontSize: 12 }}
                formatter={(value) => [formatNumber(Number(value)), 'conversations']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="font-display text-xl font-semibold tabular-nums text-amber-600">
              {formatPercent(afterHoursShare)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              After hours
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Working-hours conversations"
            value={formatNumber(workingConversations)}
            subValue="Mon–Fri, 9 AM–6 PM"
            tone="good"
          />
          <Metric
            label="After-hours conversations"
            value={formatNumber(afterHoursConversations)}
            subValue={formatPercent(afterHoursShare) + ' of demand'}
            tone="warn"
          />
          <Metric
            label="Peak hour"
            value={peakHour ? fmtHour(peakHour.hour) : '—'}
            subValue={peakHour ? `${formatNumber(peakHour.conversations)} conversations` : undefined}
            tone="accent"
          />
          <Metric
            label="Busiest day"
            value={peakDay ? DAY_FULL[peakDay.day] : '—'}
            subValue={peakDay ? `${formatNumber(peakDay.conversations)} conversations` : undefined}
            tone="accent"
          />
        </div>
      </div>

      {/* Band 2 — hourly demand curve (the chat twin of "When the phone rings") */}
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            When the questions come in
          </span>
          {peakHour && (
            <span className="text-[11px] text-slate-500">
              Peaks at{' '}
              <span className="font-semibold text-slate-700">{fmtHour(peakHour.hour)}</span>
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={hourly} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="demandArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brand.blue} stopOpacity={0.35} />
                <stop offset="100%" stopColor={brand.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="hour" tickFormatter={fmtHour} {...chart.xAxis} interval={1} />
            <YAxis {...chart.yAxis} allowDecimals={false} />
            <Tooltip
              {...chart.tooltip}
              labelFormatter={(h) => fmtHour(Number(h))}
              formatter={(v) => [formatNumber(Number(v)), 'conversations']}
            />
            <Area
              type="monotone"
              dataKey="conversations"
              stroke={brand.blue}
              strokeWidth={2}
              fill="url(#demandArea)"
              isAnimationActive={false}
            />
            {peakHour && (
              <ReferenceDot
                x={peakHour.hour}
                y={peakHour.conversations}
                r={4.5}
                fill={brand.gold}
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Band 3 — day-of-week rhythm */}
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Busiest days of the week
          </span>
          {peakDay && (
            <span className="text-[11px] text-slate-500">
              Busiest is{' '}
              <span className="font-semibold text-slate-700">{DAY_FULL[peakDay.day]}</span>
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byDay} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid {...chart.grid} />
            <XAxis dataKey="day" {...chart.xAxis} />
            <YAxis {...chart.yAxis} allowDecimals={false} />
            <Tooltip
              {...chart.tooltip}
              formatter={(v) => [formatNumber(Number(v)), 'conversations']}
            />
            <Bar dataKey="conversations" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {byDay.map((d) => (
                <Cell
                  key={d.day}
                  fill={peakDay && d.isodow === peakDay.isodow ? brand.gold : brand.blue}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
