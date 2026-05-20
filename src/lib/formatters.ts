/**
 * Centralized number / percent / delta formatting for shredintel components.
 *
 * Rules (from the brief):
 *   - All counts: toLocaleString()
 *   - All percents: max 1 decimal
 *   - Deltas: signed, 1 decimal, with %
 */

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

/**
 * Accepts either a 0–1 ratio or a 0–100 value.
 * Values >1 are treated as already-percent.
 */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(digits)}%`
}

/**
 * Signed delta in percentage points or a percent change.
 * +12.1% / −3.4% / 0.0%
 */
export function formatDelta(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toFixed(digits)}%`
}

/**
 * Tailwind class string for a delta badge.
 * `positiveIsGood = false` flips the semantic — useful for "knowledge-gap dropped" cases.
 */
export function deltaTone(value: number, positiveIsGood = true): string {
  if (!Number.isFinite(value) || value === 0) {
    return 'bg-slate-100 text-slate-600'
  }
  const isPositive = value > 0
  const good = positiveIsGood ? isPositive : !isPositive
  return good
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700'
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, pct))
}
