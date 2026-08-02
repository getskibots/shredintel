import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'

/**
 * The whole fleet as a daily time-series (report.fleet_timeseries) — loaded ONCE,
 * then windowed client-side by the seasonality ribbon for instant scrubbing.
 * ~670 tiny rows; counts sum cleanly over any window.
 */
export interface FleetDay {
  day: string // YYYY-MM-DD
  convs: number
  pos: number
  neu: number
  neg: number
  resolved: number
}

export function useFleetTimeseries(): { data: FleetDay[] | null; isLoading: boolean } {
  const [data, setData] = useState<FleetDay[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      if (!sb) { setData([]); return }
      const { data, error } = await sb
        .schema('report')
        .from('fleet_timeseries')
        .select('day,convs,pos,neu,neg,resolved')
        .order('day', { ascending: true })
      if (!cancelled) setData(error ? [] : ((data as FleetDay[]) ?? []))
    })()
    return () => { cancelled = true }
  }, [])

  return { data, isLoading: data === null }
}
