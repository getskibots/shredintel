import { useEffect, useRef } from 'react'
import { brand } from '../../lib/chartTheme'

/**
 * Offline US dot-map. Draws the states (bundled us-atlas topojson — NO external
 * tile service, so no guest location leaves our infra) plus a circle per point,
 * sized by volume, via vega-embed (our existing chart engine, lazy-loaded).
 *
 * Two modes from one component:
 *  - overview  (default): many city dots, sized by conversations, click → drill.
 *  - single (`single`)   : one fixed pin at an exact lat/lon — the conversation
 *                          record's "here's this customer" map.
 */
export interface MapPoint {
  city: string
  lat: number
  lon: number
  conversations: number
}

export function UsDotMap({
  points,
  height = 300,
  onSelect,
  single = false,
}: {
  points: MapPoint[]
  height?: number
  onSelect?: (city: string) => void
  single?: boolean
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
          import('us-atlas/states-10m.json'),
        ])
        if (cancelled || !ref.current) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const us = (topo as any).default ?? topo
        const spec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height,
          projection: { type: 'albersUsa' },
          layer: [
            {
              data: { values: us, format: { type: 'topojson', feature: 'states' } },
              mark: { type: 'geoshape', fill: '#eef2f7', stroke: '#ffffff', strokeWidth: 1 },
            },
            {
              data: { values: points },
              mark: {
                type: 'circle',
                color: brand.blue,
                opacity: single ? 0.9 : 0.6,
                stroke: '#ffffff',
                strokeWidth: single ? 1.5 : 0.5,
              },
              encoding: {
                longitude: { field: 'lon', type: 'quantitative' },
                latitude: { field: 'lat', type: 'quantitative' },
                ...(single
                  ? { size: { value: 240 } }
                  : {
                      size: {
                        field: 'conversations',
                        type: 'quantitative',
                        scale: { range: [40, 900] },
                        legend: null,
                      },
                    }),
                ...(single
                  ? {}
                  : {
                      tooltip: [
                        { field: 'city', title: 'City' },
                        { field: 'conversations', title: 'Conversations', format: ',' },
                      ],
                    }),
              },
            },
          ],
          config: { view: { stroke: null }, background: 'transparent' },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await embed(ref.current, spec as any, { actions: false, renderer: 'svg' })
        view = res.view
        if (!single) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          view.addEventListener('click', (_e: unknown, item: any) => {
            const c = item?.datum?.city
            if (c && onSelectRef.current) onSelectRef.current(String(c))
          })
        }
      } catch {
        if (ref.current) ref.current.replaceChildren()
      }
    })()
    return () => {
      cancelled = true
      try { view?.finalize() } catch { /* noop */ }
    }
  }, [points, height, single])

  return (
    <div
      ref={ref}
      className="w-full overflow-hidden"
      style={{ minHeight: height, cursor: onSelect && !single ? 'pointer' : undefined }}
    />
  )
}
