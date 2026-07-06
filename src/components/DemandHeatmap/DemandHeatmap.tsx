import { EmptyState, Metric, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type {
  DayOfWeek,
  DemandHeatmapCell,
  DemandHeatmapProps,
  TimeBucket,
} from '../../types/analytics'

export type { DemandHeatmapProps } from '../../types/analytics'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BUCKETS: TimeBucket[] = [
  '12AM–3AM',
  '3AM–6AM',
  '6AM–9AM',
  '9AM–12PM',
  '12PM–3PM',
  '3PM–6PM',
  '6PM–9PM',
  '9PM–12AM',
]

/** Working hours window (approximate) — 9AM–6PM, Mon–Fri */
function isWorkingBucket(day: DayOfWeek, bucket: TimeBucket): boolean {
  const weekend = day === 'Sat' || day === 'Sun'
  if (weekend) return false
  return bucket === '9AM–12PM' || bucket === '12PM–3PM' || bucket === '3PM–6PM'
}

function intensity(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'bg-slate-100 text-slate-400'
  const ratio = value / max
  // 6 steps of sky
  if (ratio >= 0.85) return 'bg-sky-600 text-white'
  if (ratio >= 0.65) return 'bg-sky-500 text-white'
  if (ratio >= 0.45) return 'bg-sky-400 text-white'
  if (ratio >= 0.28) return 'bg-sky-300 text-sky-900'
  if (ratio >= 0.12) return 'bg-sky-200 text-sky-900'
  return 'bg-sky-100 text-sky-900'
}

export function DemandHeatmap({
  cells,
  peakCell,
  afterHoursConversations,
  afterHoursShare,
  workingHoursConversations,
}: DemandHeatmapProps) {
  const empty = !cells || cells.length === 0

  if (empty) {
    return (
      <Panel
        eyebrow="Your guests"
        title="Demand heatmap"
        description="When guest demand actually happens."
      >
        <EmptyState
          title="Time-of-day analysis is unavailable."
          message="timestamp fields are missing for this range."
        />
      </Panel>
    )
  }

  // Build a quick lookup
  const lookup = new Map<string, DemandHeatmapCell>()
  for (const c of cells) lookup.set(`${c.dayOfWeek}|${c.timeBucket}`, c)
  const max = Math.max(0, ...cells.map((c) => c.conversations))

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
      title="Demand heatmap"
      description="When guest demand actually happens — and whether you’re covering it."
      action={action}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Working-hours conversations"
          value={formatNumber(workingHoursConversations)}
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
          label="Peak window"
          value={
            peakCell
              ? `${peakCell.dayOfWeek} · ${peakCell.timeBucket}`
              : '—'
          }
          subValue={
            peakCell
              ? `${formatNumber(peakCell.conversations)} conversations`
              : undefined
          }
          tone="accent"
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="inline-grid min-w-[640px] grid-cols-[3rem_repeat(8,1fr)] gap-1.5">
          <div />
          {BUCKETS.map((b) => (
            <div
              key={b}
              className="px-1 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              {b}
            </div>
          ))}
          {DAYS.map((day) => (
            <div key={day} className="contents">
              <div className="flex items-center text-xs font-semibold text-slate-700">
                {day}
              </div>
              {BUCKETS.map((bucket) => {
                const cell = lookup.get(`${day}|${bucket}`)
                const v = cell?.conversations ?? 0
                const w = isWorkingBucket(day, bucket)
                const tooltip = cell
                  ? `${day} ${bucket}\n${formatNumber(v)} conversations\n${formatNumber(cell.userMessages)} user messages` +
                    (cell.failedConversations
                      ? `\n${formatNumber(cell.failedConversations)} failed`
                      : '') +
                    (cell.supportTouchedConversations
                      ? `\n${formatNumber(cell.supportTouchedConversations)} support-touched`
                      : '')
                  : `${day} ${bucket}\n0 conversations`
                return (
                  <div
                    key={`${day}-${bucket}`}
                    title={tooltip}
                    className={[
                      'flex h-10 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition',
                      intensity(v, max),
                      w
                        ? 'ring-1 ring-inset ring-emerald-300/60'
                        : '',
                    ].join(' ')}
                  >
                    {v >= 10 ? formatNumber(v) : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-600">Low</span>
          <div className="flex gap-1">
            <span className="h-3 w-5 rounded bg-sky-100" />
            <span className="h-3 w-5 rounded bg-sky-200" />
            <span className="h-3 w-5 rounded bg-sky-300" />
            <span className="h-3 w-5 rounded bg-sky-400" />
            <span className="h-3 w-5 rounded bg-sky-500" />
            <span className="h-3 w-5 rounded bg-sky-600" />
          </div>
          <span className="font-medium text-slate-600">High</span>
        </div>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded ring-1 ring-inset ring-emerald-300/60" />
          Working hours (Mon–Fri 9 AM–6 PM)
        </span>
      </div>
    </Panel>
  )
}
