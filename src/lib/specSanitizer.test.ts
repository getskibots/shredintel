import { describe, it, expect } from 'vitest'
import { sanitizeChart, topNCategories, foldStackSegments, MAX_CATEGORIES } from './specSanitizer'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enc = (r: { spec: Record<string, unknown> }) => r.spec.encoding as any
const mark = (r: { spec: Record<string, unknown> }) =>
  typeof r.spec.mark === 'string' ? r.spec.mark : (r.spec.mark as { type: string }).type

describe('sanitizeChart — mark repair', () => {
  it('converts a pie/arc chart to a horizontal bar', () => {
    const r = sanitizeChart(
      { mark: 'arc', encoding: { theta: { field: 'n', type: 'quantitative' }, color: { field: 'sentiment', type: 'nominal' } } },
      [{ sentiment: 'Positive', n: 10 }, { sentiment: 'Negative', n: 4 }],
    )
    expect(mark(r)).toBe('bar')
    expect(enc(r).y.field).toBe('sentiment')
    expect(enc(r).y.type).toBe('nominal')
    expect(enc(r).x.type).toBe('quantitative')
  })

  it('flips a nominal-x + quantitative-y bar to horizontal and drops rotated labels', () => {
    const r = sanitizeChart(
      { mark: 'bar', encoding: { x: { field: 'section', type: 'nominal', axis: { labelAngle: -45 } }, y: { field: 'n', type: 'quantitative' } } },
      [{ section: 'Tickets', n: 5 }],
    )
    expect(enc(r).y.field).toBe('section')
    expect(enc(r).y.type).toBe('nominal')
    expect(enc(r).y.sort).toBe('-x')
    expect(enc(r).x.field).toBe('n')
    expect(enc(r).y.axis?.labelAngle).toBeUndefined()
  })

  it('leaves a temporal time-series bar as-is (not flipped, not trimmed)', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ day: `2026-01-${i + 1}`, n: i }))
    const r = sanitizeChart({ mark: 'bar', encoding: { x: { field: 'day', type: 'temporal' }, y: { field: 'n', type: 'quantitative' } } }, rows)
    expect(enc(r).x.type).toBe('temporal')
    expect(r.rows.length).toBe(25)
  })
})

describe('sanitizeChart — legibility', () => {
  it('caps > 12 categories, folding the tail into "Other"', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ section: `S${i}`, n: 20 - i }))
    const r = sanitizeChart({ mark: 'bar', encoding: { y: { field: 'section', type: 'nominal' }, x: { field: 'n', type: 'quantitative' } } }, rows)
    expect(r.rows.length).toBe(MAX_CATEGORIES + 1)
    const other = r.rows.find((x) => x.section === 'Other')
    expect(other).toBeDefined()
    // tail = ranks 13..20 of measures 8,7,6,5,4,3,2,1 = 36
    expect(other!.n).toBe(8 + 7 + 6 + 5 + 4 + 3 + 2 + 1)
  })

  it('keeps <= 12 categories untouched', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ section: `S${i}`, n: i }))
    const r = sanitizeChart({ mark: 'bar', encoding: { y: { field: 'section', type: 'nominal' }, x: { field: 'n', type: 'quantitative' } } }, rows)
    expect(r.rows.length).toBe(8)
    expect(r.rows.find((x) => x.section === 'Other')).toBeUndefined()
  })

  it('folds a stacked chart with > 4 color segments down to 4 + Other', () => {
    const rows = [6, 5, 4, 3, 2, 1].map((n, i) => ({ stage: 'Cart', seg: `seg${i}`, n }))
    const r = sanitizeChart(
      { mark: 'bar', encoding: { x: { field: 'stage', type: 'nominal' }, y: { field: 'n', type: 'quantitative' }, color: { field: 'seg', type: 'nominal' } } },
      rows,
    )
    const segs = new Set(r.rows.map((x) => x.seg))
    expect(segs.size).toBe(5) // 4 kept + Other
    expect(segs.has('Other')).toBe(true)
    const other = r.rows.find((x) => x.seg === 'Other')
    expect(other!.n).toBe(2 + 1)
  })

  it('strips model-invented color palettes', () => {
    const r = sanitizeChart(
      { mark: 'bar', encoding: { y: { field: 'section', type: 'nominal', sort: '-x' }, x: { field: 'n', type: 'quantitative' }, color: { field: 'section', type: 'nominal', scale: { range: ['#ff0000', '#00ff00'] } } } },
      [{ section: 'Tickets', n: 3 }],
    )
    expect(enc(r).color.scale?.range).toBeUndefined()
  })

  it('adds human axis titles and SI number format', () => {
    const r = sanitizeChart({ mark: 'bar', encoding: { y: { field: 'funnel_stage', type: 'nominal', sort: '-x' }, x: { field: 'conversations', type: 'quantitative' } } }, [{ funnel_stage: 'Cart', conversations: 1200 }])
    expect(enc(r).y.axis.title).toBe('Funnel stage')
    expect(enc(r).x.axis.title).toBe('Conversations')
    expect(enc(r).x.axis.format).toBe('s')
  })

  it('does not mutate the input spec or rows', () => {
    const spec = { mark: 'arc', encoding: { theta: { field: 'n', type: 'quantitative' }, color: { field: 'sentiment', type: 'nominal' } } }
    const rows = [{ sentiment: 'Positive', n: 10 }]
    sanitizeChart(spec, rows)
    expect(spec.mark).toBe('arc')
    expect(rows.length).toBe(1)
  })
})

describe('helpers', () => {
  it('topNCategories collapses the tail and preserves the top', () => {
    const rows = [{ k: 'a', n: 10 }, { k: 'b', n: 5 }, { k: 'c', n: 3 }, { k: 'd', n: 1 }]
    const out = topNCategories(rows, 'k', 'n', 2)
    expect(out.length).toBe(3)
    expect(out.find((r) => r.k === 'Other')!.n).toBe(4)
  })

  it('foldStackSegments merges beyond N into one Other per category', () => {
    const rows = [
      { cat: 'X', seg: 'a', n: 5 }, { cat: 'X', seg: 'b', n: 4 },
      { cat: 'X', seg: 'c', n: 3 }, { cat: 'X', seg: 'd', n: 2 },
    ]
    const out = foldStackSegments(rows, 'seg', 'n', 'cat', 2)
    expect(out.length).toBe(3) // a, b, Other(c+d)
    expect(out.find((r) => r.seg === 'Other')!.n).toBe(5)
  })
})
