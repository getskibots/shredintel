import { useEffect, useRef } from 'react'
import { brand } from '../../lib/chartTheme'

/**
 * Offline North-America dot-map — like UsDotMap but covers the US + Canada (+
 * Mexico), because voice callers are Canadian-heavy (Calgary/Edmonton lead).
 * Draws the countries (bundled world-atlas topojson, filtered to NA — no external
 * tiles, nothing leaves our infra) + a circle per caller city, sized by call
 * volume, click → drill. mercator projection auto-fits to the filtered NA extent.
 */
export interface MapPoint {
  city: string
  lat: number
  lon: number
  conversations: number
}

// ISO 3166-1 numeric ids for the NA basemap (world-atlas countries-110m).
const NA_IDS = ['840', '124', '484'] // United States, Canada, Mexico

export function NaDotMap({
  points,
  height = 300,
  onSelect,
}: {
  points: MapPoint[]
  height?: number
  onSelect?: (city: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let view: any = null
    ;(async () => {
      if (!ref.current || points.length === 0) return
      try {
        const [{ default: embed }, topo] = await Promise.all([
          import('vega-embed'),
          import('world-atlas/countries-110m.json'),
        ])
        if (cancelled || !ref.current) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const world = (topo as any).default ?? topo
        const spec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height,
          projection: { type: 'mercator' },
          layer: [
            {
              data: { values: world, format: { type: 'topojson', feature: 'countries' } },
              transform: [{ filter: `indexof(${JSON.stringify(NA_IDS)}, '' + datum.id) >= 0` }],
              mark: { type: 'geoshape', fill: '#eef2f7', stroke: '#ffffff', strokeWidth: 1 },
            },
            {
              data: { values: points },
              mark: { type: 'circle', color: brand.blue, opacity: 0.6, stroke: '#ffffff', strokeWidth: 0.5 },
              encoding: {
                longitude: { field: 'lon', type: 'quantitative' },
                latitude: { field: 'lat', type: 'quantitative' },
                size: { field: 'conversations', type: 'quantitative', scale: { range: [40, 900] }, legend: null },
                tooltip: [
                  { field: 'city', title: 'City' },
                  { field: 'conversations', title: 'Calls', format: ',' },
                ],
              },
            },
          ],
          config: { view: { stroke: null }, background: 'transparent' },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await embed(ref.current, spec as any, { actions: false, renderer: 'svg' })
        view = res.view
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        view.addEventListener('click', (_e: unknown, item: any) => {
          const c = item?.datum?.city
          if (c && onSelectRef.current) onSelectRef.current(String(c))
        })
      } catch {
        if (ref.current) ref.current.replaceChildren()
      }
    })()
    return () => {
      cancelled = true
      try { view?.finalize() } catch { /* noop */ }
    }
  }, [points, height])

  return (
    <div
      ref={ref}
      className="w-full overflow-hidden"
      style={{ minHeight: height, cursor: onSelect ? 'pointer' : undefined }}
    />
  )
}
