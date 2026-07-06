import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { BreakdownBars } from '../BreakdownBars'
import { ConversationExplorer } from '../ConversationExplorer'
import { UsDotMap } from '../UsDotMap'
import { EmptyState, Panel } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { GuestLocationsProps } from '../../types/analytics'

export type { GuestLocationsProps } from '../../types/analytics'

/**
 * § 4 — Guest locations (offline IP → GeoLite2). The US / Canada / International
 * market split + the top guest cities. Click a city → the conversations from
 * there. Scoped to substantive = real guests (bot/datacenter traffic washes
 * out at this layer). Location is city-level only — the raw IP never reaches
 * this anon-read layer.
 */
export function GuestLocations({
  cities,
  cityPoints,
  markets,
  totalLocated,
  countryCount,
  botId,
  range,
}: GuestLocationsProps & { botId?: number; range?: { from: string; to: string } }) {
  const [drill, setDrill] = useState<string | null>(null)
  const empty = totalLocated === 0 || (cities.length === 0 && markets.length === 0)
  return (
    <Panel
      eyebrow="Your guests"
      title="Guest locations"
      description="Where your guests are, from their IP at session start. Click a city to read those conversations."
    >
      {empty ? (
        <EmptyState
          title="No location data in range."
          message="Guest location is derived from the IP at session start; it populates as conversations sync."
        />
      ) : (
        <>
          {markets.length > 0 && (
            <div className="mb-5 grid grid-cols-3 gap-3">
              {markets.map((m) => (
                <div key={m.label} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="truncate text-xs text-slate-500">{m.label}</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-slate-900">
                    {formatPercent(m.share)}
                  </div>
                  <div className="text-[11px] tabular-nums text-slate-400">{formatNumber(m.conversations)}</div>
                </div>
              ))}
            </div>
          )}
          {cityPoints.length > 0 && (
            <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/40 p-1">
              <UsDotMap points={cityPoints} height={300} onSelect={botId ? setDrill : undefined} />
            </div>
          )}
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-slate-400" /> Top guest cities
          </div>
          <BreakdownBars items={cities} max={10} onSelect={botId ? setDrill : undefined} />
          <p className="mt-3 text-[11px] text-slate-400">
            {formatNumber(totalLocated)} located conversations across {countryCount}{' '}
            {countryCount === 1 ? 'country' : 'countries'}. GeoLite2 data by MaxMind.
          </p>
        </>
      )}
      {drill && botId && (
        <ConversationExplorer
          botId={botId}
          range={range}
          payload={{ botId, from: range?.from, to: range?.to, city: drill.split(',')[0].trim() }}
          onClose={() => setDrill(null)}
        />
      )}
    </Panel>
  )
}
