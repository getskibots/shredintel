/**
 * Voice-call analytics hook — the data layer for VoiceAnalyticsPage.
 *
 * Pulls the call_* views (report.call_volume/geo/hours, built on the VOICE_TWILIO
 * conversation set) via fetchVoiceBundle, and derives period-aggregated metrics:
 * volume + abandon rate, typical duration, peak-hours (staffing), caller geo, and
 * the reused enrichment breakdowns (handover/sentiment/section — a call IS a
 * conversation, so intel_* applies to voice too).
 *
 * Mirrors the AnalyticsState contract used by the chat hooks. When Supabase isn't
 * configured OR the call_* views return nothing, it yields HONEST EMPTIES (zeros /
 * []), never fabricated demo numbers — voice is bot 248's real data or nothing.
 */
import { useEffect, useState } from 'react'
import { resolveSelection, type PeriodSelection } from '../lib/period'
import { supabaseConfigured } from '../lib/supabase'
import { fetchVoiceBundle, type VoiceBundle, type IntelBreakdownRow } from './queries'
import type { AnalyticsState } from './useAnalytics'

export interface VoiceGeoPoint {
  country: string | null
  city: string | null
  lat: number | null
  lon: number | null
  calls: number
}
export interface VoiceHourPoint {
  hour: number // resort-local hour 0..23
  calls: number
  connectedCalls: number
}
export interface VoiceTrendPoint {
  date: string
  voiceConvs: number
  connectedCalls: number
  unconnected: number
}
export interface VoiceBreakdown {
  key: string
  conversations: number
}
export interface VoiceCallerAgg {
  unique: number
  repeat: number
  repeatPct: number
  oneTime: number
  twoThree: number
  fourPlus: number
  avgCalls: number
  maxCalls: number
}
export interface VoiceTopCaller {
  userId: number
  calls: number
  firstDay: string
  lastDay: string
  activeDays: number
}

export interface VoiceMetrics {
  // headline KPIs (period totals)
  voiceConvs: number
  connectedCalls: number
  unconnected: number
  abandonPct: number // unconnected / voiceConvs
  engagedCalls: number
  handoverCalls: number
  /** Connected-weighted average of daily medians — a "typical call length" proxy
   *  (a true period median needs per-call rows). null when no connected calls. */
  medianDurSec: number | null
  avgDurSec: number | null // mean connected call length
  talkSec: number // total connected talk time (seconds)
  // series
  volumeTrend: VoiceTrendPoint[]
  hours: VoiceHourPoint[] // always length 24 (0..23), zero-filled
  geo: VoiceGeoPoint[] // sorted desc by calls
  // repeat callers (all-time; keyed on the phone identity)
  callers: VoiceCallerAgg | null
  topCallers: VoiceTopCaller[]
  // reused enrichment
  handoverMix: VoiceBreakdown[]
  sentimentMix: VoiceBreakdown[]
  sectionMix: VoiceBreakdown[]
}

export const EMPTY_VOICE_METRICS: VoiceMetrics = {
  voiceConvs: 0, connectedCalls: 0, unconnected: 0, abandonPct: 0, engagedCalls: 0,
  handoverCalls: 0, medianDurSec: null, avgDurSec: null, talkSec: 0,
  volumeTrend: [], hours: [], geo: [], callers: null, topCallers: [],
  handoverMix: [], sentimentMix: [], sectionMix: [],
}

const sum = <T,>(rows: T[], f: (r: T) => number): number =>
  rows.reduce((a, r) => a + (f(r) || 0), 0)

function aggByKey(rows: IntelBreakdownRow[]): VoiceBreakdown[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.conversations)
  return Array.from(m, ([key, conversations]) => ({ key, conversations }))
    .sort((a, b) => b.conversations - a.conversations)
}

/** Fold the daily call_* rows into the period-level shape the page renders. */
export function deriveVoiceMetrics(b: VoiceBundle): VoiceMetrics {
  const vol = b.callVolume
  const voiceConvs = sum(vol, (r) => r.voice_convs)
  const connectedCalls = sum(vol, (r) => r.connected_calls)
  const unconnected = sum(vol, (r) => r.unconnected)
  const engagedCalls = sum(vol, (r) => r.engaged_calls)
  const handoverCalls = sum(vol, (r) => r.handover_calls)
  const abandonPct = voiceConvs > 0 ? Math.round((unconnected / voiceConvs) * 100) : 0

  const durRows = vol.filter((r) => r.median_dur_sec != null && r.connected_calls > 0)
  const durWeight = sum(durRows, (r) => r.connected_calls)
  const medianDurSec = durWeight
    ? Math.round(sum(durRows, (r) => (r.median_dur_sec as number) * r.connected_calls) / durWeight)
    : null
  const avgRows = vol.filter((r) => r.avg_dur_sec != null && r.connected_calls > 0)
  const avgWeight = sum(avgRows, (r) => r.connected_calls)
  const avgDurSec = avgWeight
    ? Math.round(sum(avgRows, (r) => (r.avg_dur_sec as number) * r.connected_calls) / avgWeight)
    : null
  const talkSec = sum(vol, (r) => r.talk_sec ?? 0)

  const volumeTrend: VoiceTrendPoint[] = [...vol]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ date: r.day, voiceConvs: r.voice_convs, connectedCalls: r.connected_calls, unconnected: r.unconnected }))

  const hourMap = new Map<number, { calls: number; connectedCalls: number }>()
  for (const r of b.callHours) {
    const cur = hourMap.get(r.hour_local) ?? { calls: 0, connectedCalls: 0 }
    cur.calls += r.calls
    cur.connectedCalls += r.connected_calls
    hourMap.set(r.hour_local, cur)
  }
  const hours: VoiceHourPoint[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, ...(hourMap.get(h) ?? { calls: 0, connectedCalls: 0 }),
  }))

  const geoMap = new Map<string, VoiceGeoPoint>()
  for (const r of b.callGeo) {
    const key = `${r.from_country ?? ''}|${r.from_city ?? ''}`
    const cur = geoMap.get(key) ?? { country: r.from_country, city: r.from_city, lat: r.from_lat, lon: r.from_lon, calls: 0 }
    cur.calls += r.calls
    geoMap.set(key, cur)
  }
  const geo = Array.from(geoMap.values()).sort((a, b) => b.calls - a.calls)

  const cs = b.callerStats
  return {
    voiceConvs, connectedCalls, unconnected, abandonPct, engagedCalls, handoverCalls, medianDurSec, avgDurSec, talkSec,
    volumeTrend, hours, geo,
    callers: cs
      ? {
          unique: cs.callers,
          repeat: cs.repeat_callers,
          repeatPct: cs.callers > 0 ? Math.round((100 * cs.repeat_callers) / cs.callers) : 0,
          oneTime: cs.one_time, twoThree: cs.two_three, fourPlus: cs.four_plus,
          avgCalls: Number(cs.avg_calls), maxCalls: cs.max_calls,
        }
      : null,
    topCallers: b.callCallers.map((r) => ({ userId: r.user_id, calls: r.calls, firstDay: r.first_day, lastDay: r.last_day, activeDays: r.active_days })),
    handoverMix: aggByKey(b.intelHandover),
    sentimentMix: aggByKey(b.intelSentiment),
    sectionMix: aggByKey(b.intelSection),
  }
}

export function useVoiceCallAnalytics(
  botId: number,
  selection: PeriodSelection,
): AnalyticsState<VoiceMetrics> {
  const [state, setState] = useState<AnalyticsState<VoiceMetrics>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const { from, to } = resolveSelection(selection)
  const key = `${botId}|${from}|${to}`

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: EMPTY_VOICE_METRICS, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, isLoading: true }))
    ;(async () => {
      try {
        const bundle = await fetchVoiceBundle(botId, from, to)
        if (cancelled) return
        if (!bundle || bundle.callVolume.length === 0) {
          setState({ data: EMPTY_VOICE_METRICS, isLoading: false, isLive: false, error: null })
          return
        }
        setState({ data: deriveVoiceMetrics(bundle), isLoading: false, isLive: true, error: null })
      } catch (err) {
        if (cancelled) return
        setState({ data: EMPTY_VOICE_METRICS, isLoading: false, isLive: false, error: err as Error })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
