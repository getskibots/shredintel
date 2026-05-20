import { Panel } from '../shared'
import { clampPercent, formatNumber, formatPercent } from '../../lib/formatters'

export interface VoiceGeographyProps {
  rows: Array<{
    country: string
    conversations: number
    share: number
  }>
}

export function VoiceGeography({ rows }: VoiceGeographyProps) {
  const total = rows.reduce((s, r) => s + r.conversations, 0)
  const top = rows[0]
  return (
    <Panel
      eyebrow="§ 4 Behavioral Context"
      title="Where callers are calling from"
      description="Country distribution of inbound calls, derived from IP geo at session start."
      action={
        top ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              {top.country}
            </div>
            <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">
              {formatPercent(top.share)}
            </div>
          </div>
        ) : undefined
      }
    >
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.country}
            className="grid grid-cols-[10rem_1fr_auto] items-center gap-3"
          >
            <span className="truncate text-sm font-medium text-slate-700">
              {r.country}
            </span>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                style={{ width: `${clampPercent(r.share * 100)}%` }}
              />
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="font-semibold text-slate-800">{formatPercent(r.share)}</div>
              <div className="text-slate-500">{formatNumber(r.conversations)}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-slate-400">
        {formatNumber(total)} calls across {rows.length} countries this period. North America accounts for ~99% of volume.
      </p>
    </Panel>
  )
}
