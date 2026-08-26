/**
 * Shared period-selection primitives. One source of truth used by the chat
 * dashboard, the voice dashboard, and the Supabase live-fetch layer.
 *
 * A selection is either a named preset (7d/30d/90d/all) or an explicit
 * from/to date range. Everywhere downstream we work off the RESOLVED range
 * ({ from, to, days, label }) so fixtures and live queries share the same
 * shape.
 */

export type PresetKey = '1d' | '3d' | '7d' | '30d' | '90d' | '365d' | 'all'

export type PeriodSelection =
  | { kind: 'preset'; preset: PresetKey }
  | { kind: 'custom'; from: string; to: string } // ISO YYYY-MM-DD, inclusive

export interface ResolvedPeriod {
  /** ISO YYYY-MM-DD, inclusive. */
  from: string
  /** ISO YYYY-MM-DD, inclusive. */
  to: string
  /** Number of days in the window, inclusive of both ends. */
  days: number
  /** Human label shown in dashboards. */
  label: string
  /** Short label used in chips. */
  shortLabel: string
  /** Echo of the input selection. */
  selection: PeriodSelection
}

// ── Small date utilities (UTC, ISO-only — no time zone drift) ─────────

/** Today's date in UTC as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/** Yesterday in UTC as YYYY-MM-DD. Live ETL is nightly, so today's row isn't ready. */
export function yesterdayISO(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function parseISO(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}

export function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, delta: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + delta)
  return formatISO(d)
}

export function daysBetween(fromISO: string, toISO: string): number {
  const ms = parseISO(toISO).getTime() - parseISO(fromISO).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

// ── Formatting ────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** "Jun 15, 2026" */
export function formatDateHuman(iso: string): string {
  const d = parseISO(iso)
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** "Jun 15 – Jul 15, 2026" (or spans years if needed) */
export function formatRangeHuman(fromISO: string, toISO: string): string {
  const from = parseISO(fromISO)
  const to = parseISO(toISO)
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear()
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth()
  if (sameMonth) {
    return `${MONTHS_SHORT[from.getUTCMonth()]} ${from.getUTCDate()}–${to.getUTCDate()}, ${to.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${MONTHS_SHORT[from.getUTCMonth()]} ${from.getUTCDate()} – ${MONTHS_SHORT[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`
  }
  return `${MONTHS_SHORT[from.getUTCMonth()]} ${from.getUTCDate()}, ${from.getUTCFullYear()} – ${MONTHS_SHORT[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`
}

// ── Resolution ────────────────────────────────────────────────────────

const PRESET_LABELS: Record<PresetKey, { long: string; short: string }> = {
  '1d':  { long: 'Yesterday',     short: 'Yesterday' },
  '3d':  { long: 'Last 3 days',   short: 'Last 3 days' },
  '7d':  { long: 'Last 7 days',   short: 'Last 7 days' },
  '30d': { long: 'Last 30 days',  short: 'Last 30 days' },
  '90d': { long: 'Last 90 days',  short: 'Last 90 days' },
  '365d': { long: 'Last 12 months', short: 'Last 12 months' },
  'all': { long: 'All time',      short: 'All time' },
}

/** "All time" fixture bound — 730 days back is a safe upper limit. */
const ALL_TIME_LOOKBACK_DAYS = 730

/** Resolve a selection to concrete { from, to, days, label }. */
export function resolveSelection(sel: PeriodSelection): ResolvedPeriod {
  const to = yesterdayISO() // ETL is nightly — today isn't in yet
  if (sel.kind === 'preset') {
    const preset = sel.preset
    const days =
      preset === '1d' ? 1 :
      preset === '3d' ? 3 :
      preset === '7d' ? 7 :
      preset === '30d' ? 30 :
      preset === '90d' ? 90 :
      preset === '365d' ? 365 :
      ALL_TIME_LOOKBACK_DAYS
    const from = addDays(to, -(days - 1))
    return {
      from,
      to,
      days,
      label: PRESET_LABELS[preset].long,
      shortLabel: PRESET_LABELS[preset].short,
      selection: sel,
    }
  }
  // custom
  const days = daysBetween(sel.from, sel.to)
  const label = formatRangeHuman(sel.from, sel.to)
  return {
    from: sel.from,
    to: sel.to,
    days,
    label,
    shortLabel: label,
    selection: sel,
  }
}

// ── URL param round-trip ──────────────────────────────────────────────
//
// Presets: ?period=7d | 30d | 90d | all
// Custom:  ?from=YYYY-MM-DD&to=YYYY-MM-DD  (period is omitted or 'custom')
//
// Any invalid combination falls back to the default preset.

const VALID_PRESETS: PresetKey[] = ['1d', '3d', '7d', '30d', '90d', '365d', 'all']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function selectionFromSearchParams(
  params: URLSearchParams,
  fallback: PeriodSelection = { kind: 'preset', preset: '7d' },
): PeriodSelection {
  const period = params.get('period')
  const from = params.get('from')
  const to = params.get('to')

  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) {
    return { kind: 'custom', from, to }
  }
  if (period && (VALID_PRESETS as string[]).includes(period)) {
    return { kind: 'preset', preset: period as PresetKey }
  }
  return fallback
}

/** Mutates a URLSearchParams to reflect the given selection. Returns it. */
export function writeSelectionToSearchParams(
  params: URLSearchParams,
  sel: PeriodSelection,
): URLSearchParams {
  if (sel.kind === 'preset') {
    // Always write the preset explicitly. (Previously 7d was omitted as "the
    // default" — but pages differ: Fleet and Voice default to All time, so an
    // omitted param made "Last 7 days" silently fall back to the wrong window.)
    params.set('period', sel.preset)
    params.delete('from')
    params.delete('to')
  } else {
    params.set('period', 'custom')
    params.set('from', sel.from)
    params.set('to', sel.to)
  }
  return params
}
