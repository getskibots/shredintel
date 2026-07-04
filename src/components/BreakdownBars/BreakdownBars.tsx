import { brand } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { BreakdownItem } from '../../types/analytics'

/**
 * Reusable ranked horizontal-bar breakdown (label · bar · count/share).
 * Pure CSS bars on the brand palette. When `onSelect` is passed, each row is a
 * button that drills into the matching conversations.
 */
export function BreakdownBars({
  items,
  tone = 'brand',
  max,
  onSelect,
}: {
  items: BreakdownItem[]
  tone?: 'brand' | 'warn'
  max?: number
  onSelect?: (label: string) => void
}) {
  const rows = max ? items.slice(0, max) : items
  const top = Math.max(1, ...rows.map((r) => r.conversations))
  const color = tone === 'warn' ? brand.gold : brand.blue

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="w-40 shrink-0 truncate text-sm text-slate-700" title={r.label}>
              {r.label}
            </div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${(r.conversations / top) * 100}%`, backgroundColor: color }}
              />
            </div>
            <div className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
              {formatNumber(r.conversations)} · {formatPercent(r.share)}
            </div>
          </>
        )
        return onSelect ? (
          <button
            key={r.label}
            type="button"
            onClick={() => onSelect(r.label)}
            title={`View ${r.label} conversations`}
            className="flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-slate-50"
          >
            {inner}
          </button>
        ) : (
          <div key={r.label} className="flex items-center gap-3">
            {inner}
          </div>
        )
      })}
    </div>
  )
}
