import { useEffect, useMemo, useState } from 'react'
import { supabaseConfigured } from '../lib/supabase'
import { fetchLiveBundle, periodDates, type LiveBundle } from './queries'
import { buildMCChatFixtures, type MCChatFixtures, type MCChatPeriodKey } from '../fixtures/mc-chat'
import { buildVoiceFixtures, type VoiceFixtures, type VoicePeriodKey } from '../fixtures/voice'

// Botscrew bot ids — same across chat + voice tenants.
const BOT_ID_MC_CHAT = 2
const BOT_ID_MC_VOICE = 248

export interface AnalyticsState<T> {
  data: T | null
  isLoading: boolean
  isLive: boolean       // true = at least some fields sourced from Supabase
  error: Error | null
}

// ─── Helpers to reshape live rows into the fixture-facing prop shapes ──

function overlayMCChatLive(base: MCChatFixtures, live: LiveBundle): MCChatFixtures {
  const out = { ...base }

  // §1 Guest Intent — outcome timeline + resolution
  if (live.outcomeTimeline.length > 0) {
    const data = live.outcomeTimeline.map((r) => ({
      date: r.day,
      totalConversations: r.total_conversations,
      solved: r.solved,
      unengaged: r.unengaged,
      failed: r.failed,
      engagedConversations: r.engaged_conversations,
      engagementRate: r.engagement_rate,
      resolutionRateOfEngaged: r.resolution_rate_of_engaged,
    }))
    const totalConversations = sum(data.map((d) => d.totalConversations))
    const solved = sum(data.map((d) => d.solved))
    const unengaged = sum(data.map((d) => d.unengaged))
    const failed = sum(data.map((d) => d.failed))
    const engaged = sum(data.map((d) => d.engagedConversations))
    const engagementRate = totalConversations > 0 ? engaged / totalConversations : 0
    const resolutionRateOfEngaged = engaged > 0 ? solved / engaged : 0

    out.outcomeTimeline = {
      data,
      totals: {
        totalConversations,
        solved,
        unengaged,
        failed,
        engagementRate,
        resolutionRateOfEngaged,
      },
    }
    out.engagement = {
      totalConversations,
      engagedConversations: engaged,
      resolvedConversations: solved,
      engagementRate,
      resolutionRate: resolutionRateOfEngaged,
      knowledgeGapRate: base.engagement.knowledgeGapRate,
    }
    out.resolution = {
      resolved: solved,
      total: engaged,
      rate: resolutionRateOfEngaged,
      ratePrevious: base.resolution.ratePrevious,
      trend: data.map((d) => ({ date: d.date, rate: d.resolutionRateOfEngaged })),
    }
  }

  // §2 Customer Needs — knowledge source leaderboard rows → topIntents shape
  if (live.knowledgeSourceLeaderboard.length > 0) {
    // Aggregate per source_name across days
    const perSource = new Map<string, { bot_message_count: number; failed_count: number }>()
    let totalBotMsgs = 0
    let unsourcedBotMsgs = 0
    for (const r of live.knowledgeSourceLeaderboard) {
      totalBotMsgs += r.bot_message_count
      if (r.source_name === '(no source)') {
        unsourcedBotMsgs += r.bot_message_count
        continue
      }
      const prev = perSource.get(r.source_name) ?? { bot_message_count: 0, failed_count: 0 }
      perSource.set(r.source_name, {
        bot_message_count: prev.bot_message_count + r.bot_message_count,
        failed_count: prev.failed_count + r.failed_count,
      })
    }
    const sourcedBotMsgs = totalBotMsgs - unsourcedBotMsgs
    const topIntents = [...perSource.entries()]
      .sort((a, b) => b[1].bot_message_count - a[1].bot_message_count)
      .slice(0, 12)
      .map(([name, v]) => ({
        sourceName: name,
        botMessageCount: v.bot_message_count,
        shareOfSourcedMessages: sourcedBotMsgs > 0 ? v.bot_message_count / sourcedBotMsgs : 0,
        shareOfAllBotMessages: totalBotMsgs > 0 ? v.bot_message_count / totalBotMsgs : 0,
      }))
    if (topIntents.length > 0) {
      out.topIntents = topIntents
      out.intentTotalMessages = sum(topIntents.map((s) => s.botMessageCount))
      out.engagement = {
        ...out.engagement,
        knowledgeGapRate: totalBotMsgs > 0 ? unsourcedBotMsgs / totalBotMsgs : out.engagement.knowledgeGapRate,
      }
    }
  }

  // §4 Demand Patterns — heatmap cells
  if (live.demandHeatmap.length > 0) {
    // Aggregate by (day_of_week, time_bucket) across the whole period
    const key = (dow: string, bucket: string) => `${dow}|${bucket}`
    const cellMap = new Map<string, { conversations: number; userMessages: number }>()
    for (const r of live.demandHeatmap) {
      const k = key(r.day_of_week, r.time_bucket)
      const prev = cellMap.get(k) ?? { conversations: 0, userMessages: 0 }
      cellMap.set(k, {
        conversations: prev.conversations + r.conversations,
        userMessages: prev.userMessages + r.user_messages,
      })
    }
    const cells = [...cellMap.entries()].map(([k, v]) => {
      const [dayOfWeek, timeBucket] = k.split('|')
      return {
        dayOfWeek: dayOfWeek as MCChatFixtures['demandHeatmap']['cells'][number]['dayOfWeek'],
        timeBucket: timeBucket as MCChatFixtures['demandHeatmap']['cells'][number]['timeBucket'],
        conversations: v.conversations,
        userMessages: v.userMessages,
      }
    })
    if (cells.length > 0) {
      let peak = cells[0]
      for (const c of cells) if (c.conversations > peak.conversations) peak = c
      const workingBucketNames = new Set(['9AM–12PM', '12PM–3PM', '3PM–6PM'])
      const isWorking = (cell: typeof cells[0]) =>
        cell.dayOfWeek !== 'Sat' &&
        cell.dayOfWeek !== 'Sun' &&
        workingBucketNames.has(cell.timeBucket)
      const total = sum(cells.map((c) => c.conversations))
      const working = sum(cells.filter(isWorking).map((c) => c.conversations))
      out.demandHeatmap = {
        cells,
        peakCell: peak,
        afterHoursConversations: total - working,
        afterHoursShare: total > 0 ? (total - working) / total : 0,
        workingHoursConversations: working,
      }
    }
  }

  return out
}

function overlayVoiceLive(base: VoiceFixtures, live: LiveBundle): VoiceFixtures {
  const out = { ...base }

  if (live.outcomeTimeline.length > 0) {
    const data = live.outcomeTimeline.map((r) => ({
      date: r.day,
      totalConversations: r.total_conversations,
      solved: r.solved,
      unengaged: r.unengaged,
      failed: r.failed,
      engagedConversations: r.engaged_conversations,
      engagementRate: r.engagement_rate,
      resolutionRateOfEngaged: r.resolution_rate_of_engaged,
    }))
    const totalConversations = sum(data.map((d) => d.totalConversations))
    const solved = sum(data.map((d) => d.solved))
    const unengaged = sum(data.map((d) => d.unengaged))
    const failed = sum(data.map((d) => d.failed))
    const engaged = sum(data.map((d) => d.engagedConversations))
    const resolutionRate = engaged > 0 ? solved / engaged : 0

    out.outcomeTimeline = {
      data,
      totals: {
        totalConversations,
        solved,
        unengaged,
        failed,
        engagementRate: totalConversations > 0 ? engaged / totalConversations : 0,
        resolutionRateOfEngaged: resolutionRate,
      },
    }
    out.engagement = {
      totalCalls: totalConversations,
      resolvedCalls: solved,
      unengagedCalls: unengaged,
      resolutionRate,
      humanHandoffs: base.engagement.humanHandoffs,
      handoffRate: base.engagement.handoffRate,
    }
    out.resolution = {
      resolved: solved,
      total: engaged,
      rate: resolutionRate,
      ratePrevious: base.resolution.ratePrevious,
      trend: data.map((d) => ({ date: d.date, rate: d.resolutionRateOfEngaged })),
    }
  }

  if (live.demandHeatmap.length > 0) {
    const key = (dow: string, bucket: string) => `${dow}|${bucket}`
    const cellMap = new Map<string, { conversations: number; userMessages: number }>()
    for (const r of live.demandHeatmap) {
      const k = key(r.day_of_week, r.time_bucket)
      const prev = cellMap.get(k) ?? { conversations: 0, userMessages: 0 }
      cellMap.set(k, {
        conversations: prev.conversations + r.conversations,
        userMessages: prev.userMessages + r.user_messages,
      })
    }
    const cells = [...cellMap.entries()].map(([k, v]) => {
      const [dayOfWeek, timeBucket] = k.split('|')
      return {
        dayOfWeek: dayOfWeek as VoiceFixtures['demandHeatmap']['cells'][number]['dayOfWeek'],
        timeBucket: timeBucket as VoiceFixtures['demandHeatmap']['cells'][number]['timeBucket'],
        conversations: v.conversations,
        userMessages: v.userMessages,
      }
    })
    if (cells.length > 0) {
      let peak = cells[0]
      for (const c of cells) if (c.conversations > peak.conversations) peak = c
      const workingBucketNames = new Set(['9AM–12PM', '12PM–3PM', '3PM–6PM'])
      const isWorking = (cell: typeof cells[0]) =>
        cell.dayOfWeek !== 'Sat' &&
        cell.dayOfWeek !== 'Sun' &&
        workingBucketNames.has(cell.timeBucket)
      const total = sum(cells.map((c) => c.conversations))
      const working = sum(cells.filter(isWorking).map((c) => c.conversations))
      out.demandHeatmap = {
        cells,
        peakCell: peak,
        afterHoursConversations: total - working,
        afterHoursShare: total > 0 ? (total - working) / total : 0,
        workingHoursConversations: working,
      }
    }
  }

  return out
}

function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0)
}

/**
 * Whether the live bundle actually contains any rows worth showing.
 * If every view returned 0 rows, treat it as "no live data" and stay on
 * fixtures — the badge should say DEMO, not LIVE-with-zeros.
 */
function bundleHasData(b: LiveBundle | null): boolean {
  if (!b) return false
  return (
    b.outcomeTimeline.length > 0 ||
    b.senderMixStack.length > 0 ||
    b.demandHeatmap.length > 0 ||
    b.knowledgeSourceLeaderboard.length > 0
  )
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export function useMCChatAnalytics(period: MCChatPeriodKey): AnalyticsState<MCChatFixtures> {
  const [state, setState] = useState<AnalyticsState<MCChatFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const fixtureFallback = useMemo(() => buildMCChatFixtures(period), [period])

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const { from, to } = periodDates(period)
      const bundle = await fetchLiveBundle(BOT_ID_MC_CHAT, from, to)
      if (cancelled) return
      if (!bundleHasData(bundle)) {
        setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
        return
      }
      const merged = overlayMCChatLive(fixtureFallback, bundle!)
      setState({ data: merged, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
  }, [period, fixtureFallback])

  return state
}

export function useVoiceAnalytics(period: VoicePeriodKey): AnalyticsState<VoiceFixtures> {
  const [state, setState] = useState<AnalyticsState<VoiceFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const fixtureFallback = useMemo(() => buildVoiceFixtures(period), [period])

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const { from, to } = periodDates(period)
      const bundle = await fetchLiveBundle(BOT_ID_MC_VOICE, from, to)
      if (cancelled) return
      if (!bundleHasData(bundle)) {
        setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
        return
      }
      const merged = overlayVoiceLive(fixtureFallback, bundle!)
      setState({ data: merged, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
  }, [period, fixtureFallback])

  return state
}
