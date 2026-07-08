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
export interface VoiceTransferAgg {
  checked: number // calls we have Twilio truth for
  transferred: number // actually <Dial>'d a human
  answered: number // human picked up
  transferRate: number // transferred / checked (%)
  answeredRate: number // answered / transferred (%)
  avgHumanSec: number | null // avg time with the human
}

export interface VoiceMetrics {
  // headline KPIs (period totals)
  voiceConvs: number
  connectedCalls: number
  unconnected: number
  abandonPct: number // unconnected / voiceConvs
  engagedCalls: number
  handoverCalls: number
  /** Where volume/connection comes from: 'twilio' (call_inbound truth — real call
   *  count, supersedes the double-counted mirror) or 'mirror' (conversation count,
   *  inflated ~1.6× by Botscrew's per-leg logging). Drives which KPIs are shown. */
  volumeSource: 'twilio' | 'mirror'
  /** Connected-weighted average of daily medians — a "typical call length" proxy
   *  (a true period median needs per-call rows). null when no connected calls. */
  medianDurSec: number | null
  avgDurSec: number | null // mean connected call length
  talkSec: number // total connected talk time (seconds)
  /** Where duration/talk-time comes from: 'twilio' (call_facts truth, preferred) or
   *  'mirror' (unreliable closed_at−started_at, only until a bot is Twilio-ingested). */
  durationSource: 'twilio' | 'mirror'
  /** AI-vs-human talk split (Twilio truth). null until the bot is Twilio-ingested.
   *  aiTalkSec = total call time − human-leg time; humanTalkSec = transferred human legs. */
  aiTalkSec: number | null
  humanTalkSec: number | null
  // series
  volumeTrend: VoiceTrendPoint[]
  hours: VoiceHourPoint[] // always length 24 (0..23), zero-filled
  geo: VoiceGeoPoint[] // sorted desc by calls
  // repeat callers (all-time; keyed on the phone identity)
  callers: VoiceCallerAgg | null
  topCallers: VoiceTopCaller[]
  // ground-truth transfers (Twilio) — null until ingested
  transfers: VoiceTransferAgg | null
  // reused enrichment
  handoverMix: VoiceBreakdown[]
  sentimentMix: VoiceBreakdown[]
  sectionMix: VoiceBreakdown[]
}

export const EMPTY_VOICE_METRICS: VoiceMetrics = {
  voiceConvs: 0, connectedCalls: 0, unconnected: 0, abandonPct: 0, engagedCalls: 0,
  handoverCalls: 0, volumeSource: 'mirror', medianDurSec: null, avgDurSec: null, talkSec: 0,
  durationSource: 'mirror', aiTalkSec: null, humanTalkSec: null,
  volumeTrend: [], hours: [], geo: [], callers: null, topCallers: [], transfers: null,
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
  // Volume + connection: PREFER Twilio truth (call_inbound_stats — the real call
  // count). The mirror's voice_convs double-counts (~1.6 conv records per call →
  // a phantom "41% didn't connect"). Fall back to the mirror only for bots not yet
  // Twilio-ingested (no call_inbound).
  const inb = b.callInbound
  const hasInbound = inb.length > 0 && sum(inb, (r) => r.inbound) > 0
  const volumeSource: 'twilio' | 'mirror' = hasInbound ? 'twilio' : 'mirror'
  const voiceConvs = hasInbound ? sum(inb, (r) => r.inbound) : sum(vol, (r) => r.voice_convs)
  const connectedCalls = hasInbound ? sum(inb, (r) => r.completed) : sum(vol, (r) => r.connected_calls)
  const unconnected = hasInbound ? sum(inb, (r) => r.not_connected) : sum(vol, (r) => r.unconnected)
  const engagedCalls = sum(vol, (r) => r.engaged_calls) // conversation-grain; hidden in the Twilio path
  const handoverCalls = sum(vol, (r) => r.handover_calls)
  const abandonPct = voiceConvs > 0 ? Math.round((unconnected / voiceConvs) * 100) : 0

  // Duration / talk-time: PREFER Twilio truth (call_facts_stats) — the mirror
  // dur_sec is unreliable (recon 2026-07-08: 0/40 matched Twilio, undercounts ~2×).
  // Fall back to the mirror only for bots not yet Twilio-ingested (no call_facts).
  const wavg = <T,>(rows: T[], val: (r: T) => number | null, weight: (r: T) => number): number | null => {
    const w = sum(rows, weight)
    return w ? Math.round(sum(rows, (r) => (val(r) ?? 0) * weight(r)) / w) : null
  }
  const facts = b.callFacts
  const twTalk = sum(facts, (r) => r.talk_sec ?? 0)
  const hasFacts = facts.length > 0 && twTalk > 0

  let medianDurSec: number | null
  let avgDurSec: number | null
  let talkSec: number
  let humanTalkSec: number | null
  let aiTalkSec: number | null
  if (hasFacts) {
    medianDurSec = wavg(facts.filter((r) => r.median_dur_sec != null && r.completed > 0), (r) => r.median_dur_sec, (r) => r.completed)
    avgDurSec = wavg(facts.filter((r) => r.avg_dur_sec != null && r.completed > 0), (r) => r.avg_dur_sec, (r) => r.completed)
    talkSec = twTalk
    humanTalkSec = sum(facts, (r) => r.human_talk_sec ?? 0)
    aiTalkSec = Math.max(0, twTalk - humanTalkSec)
  } else {
    medianDurSec = wavg(vol.filter((r) => r.median_dur_sec != null && r.connected_calls > 0), (r) => r.median_dur_sec, (r) => r.connected_calls)
    avgDurSec = wavg(vol.filter((r) => r.avg_dur_sec != null && r.connected_calls > 0), (r) => r.avg_dur_sec, (r) => r.connected_calls)
    talkSec = sum(vol, (r) => r.talk_sec ?? 0)
    humanTalkSec = null
    aiTalkSec = null
  }
  const durationSource: 'twilio' | 'mirror' = hasFacts ? 'twilio' : 'mirror'

  // Trend follows the same source as the headline so the chart and totals agree.
  const volumeTrend: VoiceTrendPoint[] = hasInbound
    ? [...inb]
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((r) => ({ date: r.day, voiceConvs: r.inbound, connectedCalls: r.completed, unconnected: r.not_connected }))
    : [...vol]
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

  const tChecked = sum(b.callTransfers, (r) => r.checked)
  const tXfer = sum(b.callTransfers, (r) => r.transfers)
  const tAns = sum(b.callTransfers, (r) => r.answered_transfers)
  const tHuman = sum(b.callTransfers, (r) => r.human_talk_sec ?? 0)
  const transfers = tChecked > 0
    ? {
        checked: tChecked, transferred: tXfer, answered: tAns,
        // Keep as floats — the panel formats them (transferRate via 1-decimal,
        // answeredRate via formatPercentSmart so 99.75% doesn't collapse to 100%).
        transferRate: (100 * tXfer) / tChecked,
        answeredRate: tXfer > 0 ? (100 * tAns) / tXfer : 0,
        avgHumanSec: tAns > 0 ? Math.round(tHuman / tAns) : null,
      }
    : null

  const cs = b.callerStats
  return {
    voiceConvs, connectedCalls, unconnected, abandonPct, engagedCalls, handoverCalls, volumeSource, medianDurSec, avgDurSec, talkSec,
    durationSource, aiTalkSec, humanTalkSec,
    volumeTrend, hours, geo, transfers,
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
