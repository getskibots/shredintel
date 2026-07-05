/**
 * specSanitizer — code-enforced chart legibility for AI-authored Vega-Lite specs.
 *
 * "Prompts steer, code enforces": the prompt asks the model for legible charts,
 * but this is the boundary. EVERY AI spec passes through here before render, so
 * an adversarial or sloppy spec still comes out readable:
 *   - pie / arc            → horizontal bar
 *   - nominal-x + quant-y  → horizontal bar (fixes rotated/overlapping labels)
 *   - nominal ranking      → sorted desc
 *   - > 12 categories      → keep top 12 by measure, fold the rest into "Other"
 *   - stacked > 4 segments → keep top 4 colors, fold the rest into "Other"
 *   - model-invented color palettes → stripped (chartTheme owns colors)
 *   - axis titles          → human-readable; quantitative axes → SI format (1.2k)
 * Time series (temporal encoding) are never row-trimmed — every day matters.
 *
 * Pure function → unit-tested against adversarial specs (specSanitizer.test.ts).
 */
import { humanLabel } from './drill'

type Spec = Record<string, unknown>
type Row = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chan = any

export interface SanitizeResult {
  spec: Spec
  rows: Row[]
}

export const MAX_CATEGORIES = 12
export const MAX_STACK_SEGMENTS = 4

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return 0
}

function markType(spec: Spec): string {
  const m = spec.mark as Chan
  if (typeof m === 'string') return m
  if (m && typeof m === 'object') return String(m.type || '')
  return ''
}

function setMarkType(spec: Spec, type: string): void {
  const m = spec.mark as Chan
  spec.mark = m && typeof m === 'object' ? { ...m, type } : type
}

function chanType(ch: Chan): string {
  return ch && typeof ch === 'object' ? String(ch.type || '') : ''
}
function chanField(ch: Chan): string {
  return ch && typeof ch === 'object' ? String(ch.field || '') : ''
}

/** Sum a measure grouped by a field. */
function sumBy(rows: Row[], field: string, meas: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = String(r[field])
    m.set(k, (m.get(k) || 0) + num(r[meas]))
  }
  return m
}

/** Keep the top-N categories by measure; collapse the rest into one "Other" row. */
export function topNCategories(rows: Row[], catField: string, measField: string, n: number): Row[] {
  const totals = sumBy(rows, catField, measField)
  if (totals.size <= n) return rows
  const keep = new Set(
    [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k),
  )
  const kept: Row[] = []
  let otherSum = 0
  for (const r of rows) {
    if (keep.has(String(r[catField]))) kept.push(r)
    else otherSum += num(r[measField])
  }
  kept.push({ [catField]: 'Other', [measField]: otherSum } as Row)
  return kept
}

/** Keep the top-N stack colors by measure; fold the rest into an "Other" segment. */
export function foldStackSegments(
  rows: Row[],
  colorField: string,
  measField: string,
  catField: string,
  n: number,
): Row[] {
  const totals = sumBy(rows, colorField, measField)
  if (totals.size <= n) return rows
  const keep = new Set(
    [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k),
  )
  const agg = new Map<string, Row>()
  for (const r of rows) {
    const color = keep.has(String(r[colorField])) ? String(r[colorField]) : 'Other'
    const cat = catField ? String(r[catField]) : ''
    const key = `${cat}␟${color}`
    const ex = agg.get(key)
    if (ex) ex[measField] = num(ex[measField]) + num(r[measField])
    else agg.set(key, { ...(catField ? { [catField]: cat } : {}), [colorField]: color, [measField]: num(r[measField]) } as Row)
  }
  return [...agg.values()]
}

/**
 * Sanitize an AI-authored Vega-Lite spec + its data rows. Returns a new spec and
 * (possibly) reduced rows; never mutates the inputs.
 */
export function sanitizeChart(specIn: Spec, rowsIn: Row[] = []): SanitizeResult {
  const spec: Spec = structuredClone(specIn || {})
  let rows: Row[] = Array.isArray(rowsIn) ? [...rowsIn] : []

  // 1) pie / arc → horizontal bar (theta measure → x, color category → y)
  if (['arc', 'pie'].includes(markType(spec))) {
    const e = (spec.encoding as Record<string, Chan>) || {}
    const theta = e.theta
    const color = e.color
    spec.encoding = {
      x: theta ? { ...theta, type: 'quantitative' } : { aggregate: 'count', type: 'quantitative' },
      y: color ? { field: chanField(color), type: 'nominal', sort: '-x' } : { type: 'nominal' },
    }
    setMarkType(spec, 'bar')
  }

  const enc = ((spec.encoding as Record<string, Chan>) || (spec.encoding = {} as Record<string, Chan>)) as Record<string, Chan>
  const hasTemporal = Object.values(enc).some((c) => chanType(c) === 'temporal')

  // 2) bar with nominal x + quantitative y → flip to horizontal (fixes rotated
  //    labels + long-label pileups). Time series are left alone.
  if (markType(spec) === 'bar' && !hasTemporal) {
    const x = enc.x
    const y = enc.y
    const xNominal = ['nominal', 'ordinal'].includes(chanType(x))
    const yQuant = chanType(y) === 'quantitative'
    if (xNominal && yQuant) {
      enc.y = { ...x, type: 'nominal', sort: '-x' }
      enc.x = { ...y, type: 'quantitative' }
      if (enc.y.axis) delete enc.y.axis.labelAngle
    }
  }

  // 3) horizontal nominal ranking → ensure sorted desc by the measure
  if (markType(spec) === 'bar') {
    const y = enc.y
    if (['nominal', 'ordinal'].includes(chanType(y)) && chanType(enc.x) === 'quantitative' && y.sort == null) {
      enc.y = { ...y, sort: '-x' }
    }
  }

  // 4) strip model-invented color palettes — chartTheme owns the colors
  for (const ch of Object.values(enc)) {
    if (ch && typeof ch === 'object' && ch.scale && ch.scale.range) delete ch.scale.range
  }

  // 5) human axis titles + SI number format on quantitative axes
  for (const key of ['x', 'y'] as const) {
    const ch = enc[key]
    if (!ch || typeof ch !== 'object') continue
    ch.axis = ch.axis || {}
    if (ch.field && ch.axis.title == null) ch.axis.title = humanLabel(String(ch.field))
    if (chanType(ch) === 'quantitative' && ch.axis.format == null) ch.axis.format = 's'
  }

  // ── row-dependent legibility ────────────────────────────────────────────
  const nominalCh = [enc.y, enc.x].find((c) => ['nominal', 'ordinal'].includes(chanType(c)))
  const quantCh = [enc.x, enc.y].find((c) => chanType(c) === 'quantitative')
  const catField = chanField(nominalCh)
  const measField = chanField(quantCh)
  const colorField = chanField(enc.color)

  if (colorField && measField && rows.length) {
    // 6) stacked > 4 segments → fold smallest colors into "Other"
    rows = foldStackSegments(rows, colorField, measField, catField, MAX_STACK_SEGMENTS)
  } else if (catField && measField && rows.length && !hasTemporal) {
    // 7) > 12 categories → top 12 + "Other"
    rows = topNCategories(rows, catField, measField, MAX_CATEGORIES)
  }

  return { spec, rows }
}
