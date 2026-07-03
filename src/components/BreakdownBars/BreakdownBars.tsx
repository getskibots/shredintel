import { brand } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { BreakdownItem } from '../../types/analytics'

/**
 * Reusable ranked horizontal-bar breakdown (label · bar · count/share).
 * Pure CSS bars on the brand palette — used for section demand, pinchpoints, etc.
 */
export function BreakdownBars({
  items,
  tone = 'brand',
  max,
}: {
  items: BreakdownItem[]
  tone?: 'brand' | 'warn'
  max?: number
}) {
  const rows = max ? items.slice(0, max) : items
  const top = Math.max(1, ...rows.map((r) => r.conversations))
  const color = tone === 'warn' ? brand.gold : brand.blue
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
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
        </div>
      ))}
    </div>
  )
}
