import { useEffect, useRef } from 'react'
import { brand, seriesColors } from '../../lib/chartTheme'
import { sanitizeChart } from '../../lib/specSanitizer'

/**
 * Renders an LLM-authored Vega-Lite spec — the on-the-fly chart engine. The
 * model provides the marks + encodings; the REAL query rows are injected here as
 * the dataset (grounding: data comes from the query, never the model). Themed to
 * the brand palette. vega-embed is lazy-loaded so it stays out of the main bundle.
 */

// Vega-Lite config → brand look (matches the Botscrew chart theme).
const THEME = {
  background: 'transparent',
  font: 'Inter, system-ui, sans-serif',
  axis: {
    labelColor: brand.muted,
    titleColor: brand.muted,
    gridColor: 'rgba(15,23,42,0.06)',
    domainColor: brand.axisLine,
    tickColor: brand.axisLine,
    labelFontSize: 11,
    titleFontSize: 12,
  },
  legend: { labelColor: brand.muted, titleColor: brand.heading, labelFontSize: 11 },
  title: { color: brand.heading, fontSize: 13, fontWeight: 600 },
  range: { category: [...seriesColors] },
  bar: { fill: brand.blue, cornerRadiusEnd: 3 },
  line: { stroke: brand.slate, strokeWidth: 2 },
  point: { fill: brand.slate },
  arc: { fill: brand.blue },
  view: { stroke: 'transparent' },
}

export function VegaLiteChart({
  spec,
  rows,
  height = 280,
  caption,
  onDrill,
}: {
  spec: Record<string, unknown>
  rows: Record<string, unknown>[]
  height?: number
  /** One-line lens + window, built from request context (NOT the model). Always
   *  render one for AI charts so every chart states what it's showing. */
  caption?: string
  /** Click any mark → its datum. Wire to payloadFromDatum → ConversationExplorer. */
  onDrill?: (datum: Record<string, unknown>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Ref so the click handler always sees the latest onDrill without re-embedding.
  const onDrillRef = useRef(onDrill)
  onDrillRef.current = onDrill

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let view: any = null
    ;(async () => {
      if (!ref.current) return
      try {
        const embed = (await import('vega-embed')).default
        if (cancelled || !ref.current) return
        // Code-enforced legibility: repair pies/rotated labels, cap categories,
        // strip model palettes, human axis titles (specSanitizer.ts).
        const { spec: cleanSpec, rows: cleanRows } = sanitizeChart(spec, rows)
        const specConfig = (cleanSpec.config as Record<string, unknown>) || {}
        const full = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height,
          autosize: { type: 'fit', contains: 'padding' },
          ...cleanSpec,
          data: { values: cleanRows }, // real rows from the query (sanitized)
          config: { ...THEME, ...specConfig },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await embed(ref.current, full as any, {
          actions: false,
          renderer: 'svg',
        })
        view = res.view
        // Click any mark → its datum → drill (payloadFromDatum in the caller).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        view.addEventListener('click', (_e: unknown, item: any) => {
          const datum = item?.datum
          if (datum && onDrillRef.current) onDrillRef.current(datum as Record<string, unknown>)
        })
      } catch {
        if (ref.current) ref.current.replaceChildren()
      }
    })()
    return () => {
      cancelled = true
      try { view?.finalize() } catch { /* noop */ }
    }
  }, [spec, rows, height])

  return (
    <div className="w-full">
      <div ref={ref} className="w-full overflow-hidden" style={{ minHeight: height }} />
      {caption && <p className="mt-1.5 text-center text-[11px] text-slate-400">{caption}</p>}
    </div>
  )
}
