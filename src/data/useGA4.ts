import { useEffect, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import { resolveSelection, type PeriodSelection } from '../lib/period'

/**
 * useGA4 — site-wide GA4 traffic for a bot, scoped to the dashboard's date range.
 * Reads the anon-safe report.ga4_*_daily tables (populated by the GA4 connector).
 * Returns null when the bot has no GA4 connected / no rows in range, so the card
 * simply doesn't render for non-GA4 bots (no empty state).
 *
 * Sessions + pageviews are additive across days (a session belongs to one day),
 * so summing daily rows is correct. Daily activeUsers is NOT unique-additive, so
 * we deliberately do not surface a period "users" total here.
 */
export interface GA4SourceSlice { source: string; sessions: number }
export interface GA4Summary {
  sessions: number
  pageviews: number
  events: number
  fromDay: string | null   // actual first GA4 day present in the window
  toDay: string | null     // actual last GA4 day present
  sources: GA4SourceSlice[]
}
export interface GA4State { data: GA4Summary | null; isLoading: boolean }

interface TrafficRow { day: string; sessions: number; pageviews: number; events: number }
interface SourceRow { source_medium: string; sessions: number }

export function useGA4(botId: number, selection: PeriodSelection): GA4State {
  const [state, setState] = useState<GA4State>({ data: null, isLoading: supabaseConfigured })
  const { from, to } = resolveSelection(selection)

  useEffect(() => {
    if (!supabaseConfigured || !Number.isFinite(botId)) { setState({ data: null, isLoading: false }); return }
    let cancelled = false
    setState((s) => ({ ...s, isLoading: true }))
    ;(async () => {
      const supabase = getSupabase()
      if (!supabase) { if (!cancelled) setState({ data: null, isLoading: false }); return }
      try {
        const base = (v: string) =>
          supabase.schema('report').from(v).select('*').eq('bot_id', botId).gte('day', from).lte('day', to)
        const [tr, src] = await Promise.all([
          base('ga4_traffic_daily').order('day', { ascending: true }) as unknown as Promise<{ data: TrafficRow[] | null }>,
          base('ga4_source_daily').limit(5000) as unknown as Promise<{ data: SourceRow[] | null }>,
        ])
        if (cancelled) return
        const traffic = tr.data ?? []
        if (!traffic.length) { setState({ data: null, isLoading: false }); return }

        let sessions = 0, pageviews = 0, events = 0
        let fromDay: string | null = null, toDay: string | null = null
        for (const r of traffic) {
          sessions += Number(r.sessions || 0)
          pageviews += Number(r.pageviews || 0)
          events += Number(r.events || 0)
          if (!fromDay || r.day < fromDay) fromDay = r.day
          if (!toDay || r.day > toDay) toDay = r.day
        }

        const sMap = new Map<string, number>()
        for (const r of src.data ?? []) sMap.set(r.source_medium, (sMap.get(r.source_medium) || 0) + Number(r.sessions || 0))
        const sources = [...sMap.entries()]
          .map(([source, s]) => ({ source, sessions: s }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 5)

        setState({ data: { sessions, pageviews, events, fromDay, toDay, sources }, isLoading: false })
      } catch { if (!cancelled) setState({ data: null, isLoading: false }) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, from, to])

  return state
}
