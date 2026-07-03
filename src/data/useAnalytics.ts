import { useEffect, useMemo, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import { fetchLiveBundle, periodDates, type LiveBundle } from './queries'
import { buildMCChatFixtures, type MCChatFixtures, type MCChatPeriodKey } from '../fixtures/mc-chat'
import { buildVoiceFixtures, buildVoiceFixturesForDays, type VoiceFixtures, type VoicePeriodKey } from '../fixtures/voice'
import { buildPeriodFixtures, buildPeriodFixturesForDays, type PeriodFixtures, type PeriodKey } from '../fixtures/sample'
import { resolveSelection, type PeriodSelection } from '../lib/period'

// Botscrew bot ids — same across chat + voice tenants.
const BOT_ID_MC_CHAT = 2
const BOT_ID_MC_VOICE = 248
const BOT_ID_JH_CHAT = 43

export interface AnalyticsState<T> {
  data: T | null
  isLoading: boolean
  isLive: boolean       // true = at least some fields sourced from Supabase
  error: Error | null
}

// ─── Helpers to reshape live rows into the fixture-facing prop shapes ──

// Fixture-bleed guard: when a bot is LIVE, overlay real data onto a BLANKED base
// (numbers → 0, arrays → []) instead of the demo fixtures — so any section
// without live coverage shows honest empties, never fabricated sample numbers.
// Strings/labels are preserved so panel structure stays intact.
function blankData<T>(v: T): T {
  if (Array.isArray(v)) return [] as unknown as T
  if (typeof v === 'number') return 0 as unknown as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as object)) out[k] = blankData((v as Record<string, unknown>)[k])
    return out as unknown as T
  }
  return v
}

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
 * Full-coverage overlay for the ShredIntelReportGrid (JH chat page).
 * Maps all 8 report.* views to the PeriodFixtures shape.
 */
function overlayJHChatLive(base: PeriodFixtures, live: LiveBundle): PeriodFixtures {
  const out: PeriodFixtures = { ...base }

  // § 1 — Outcome timeline + resolution + KPI totals
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
    out.resolution = {
      resolved: solved,
      total: engaged,
      rate: resolutionRateOfEngaged,
      ratePrevious: base.resolution.ratePrevious,
      trend: data.map((d) => ({ date: d.date, rate: d.resolutionRateOfEngaged })),
    }
    out.engagement = {
      totalConversations,
      engagedConversations: engaged,
      engagementRate,
      unengaged,
    }
  }

  // § 1 — Conversion pulse
  if (live.conversionPulse.length > 0) {
    const timeline = live.conversionPulse.map((r) => ({
      date: r.day,
      convertedConversations: r.converted_conversations,
      totalConversations: r.total_conversations,
      engagedConversations: r.engaged_conversations,
      conversionShareOfTotal: r.conversion_share_of_total,
      conversionShareOfEngaged: r.conversion_share_of_engaged,
    }))
    const totalConverted = sum(timeline.map((d) => d.convertedConversations))
    const totalConversations = sum(timeline.map((d) => d.totalConversations))
    const totalEngaged = sum(timeline.map((d) => d.engagedConversations))
    let bestDay = timeline[0]
    for (const d of timeline) if (d.convertedConversations > bestDay.convertedConversations) bestDay = d
    out.conversionPulse = {
      totalConverted,
      conversionShareOfTotal: totalConversations > 0 ? totalConverted / totalConversations : 0,
      conversionShareOfEngaged: totalEngaged > 0 ? totalConverted / totalEngaged : 0,
      convertedDelta: base.conversionPulse.convertedDelta,
      bestDay: { date: bestDay.date, convertedConversations: bestDay.convertedConversations },
      timeline,
    }
  }

  // § 2 — Knowledge source leaderboard
  if (live.knowledgeSourceLeaderboard.length > 0) {
    const perSource = new Map<string, { count: number; failed: number }>()
    let totalBot = 0
    let unsourced = 0
    for (const r of live.knowledgeSourceLeaderboard) {
      totalBot += r.bot_message_count
      if (r.source_name === '(no source)') {
        unsourced += r.bot_message_count
        continue
      }
      const prev = perSource.get(r.source_name) ?? { count: 0, failed: 0 }
      perSource.set(r.source_name, {
        count: prev.count + r.bot_message_count,
        failed: prev.failed + r.failed_count,
      })
    }
    const sourced = totalBot - unsourced
    const topSources = [...perSource.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([name, v]) => ({
        sourceName: name,
        botMessageCount: v.count,
        shareOfSourcedMessages: sourced > 0 ? v.count / sourced : 0,
        shareOfAllBotMessages: totalBot > 0 ? v.count / totalBot : 0,
      }))
    out.knowledgeSourceLeaderboard = {
      sourcedBotMessages: sourced,
      unsourcedBotMessages: unsourced,
      knowledgeGapRate: totalBot > 0 ? unsourced / totalBot : 0,
      topSources,
    }
  }

  // § 2 — Sender mix
  if (live.senderMixStack.length > 0) {
    const data = live.senderMixStack.map((r) => ({
      date: r.day,
      botMessages: r.bot_messages,
      userMessages: r.user_messages,
      supportMessages: r.support_messages,
      totalMessages: r.total_messages,
    }))
    const botMessages = sum(data.map((d) => d.botMessages))
    const userMessages = sum(data.map((d) => d.userMessages))
    const supportMessages = sum(data.map((d) => d.supportMessages))
    const totalMessages = botMessages + userMessages + supportMessages
    const engagedNow = out.engagement?.engagedConversations ?? 1
    out.senderMixStack = {
      totals: {
        botMessages,
        userMessages,
        supportMessages,
        totalMessages,
        botMessageShare: totalMessages > 0 ? botMessages / totalMessages : 0,
        supportMessageShare: totalMessages > 0 ? supportMessages / totalMessages : 0,
        avgMessagesPerEngagedConversation: engagedNow > 0 ? totalMessages / engagedNow : 0,
      },
      data,
    }
  }

  // § 3 — Guest identity split
  if (live.guestIdentitySplit.length > 0) {
    const totalConversations = sum(live.guestIdentitySplit.map((r) => r.total_conversations))
    const knownGuests = sum(live.guestIdentitySplit.map((r) => r.known_guests))
    const anonymousGuests = sum(live.guestIdentitySplit.map((r) => r.anonymous_guests))
    const contactableGuests = sum(live.guestIdentitySplit.map((r) => r.contactable_guests))
    out.guestIdentitySplit = {
      totalConversations,
      knownGuests,
      anonymousGuests,
      contactableGuests,
      knownGuestRate: totalConversations > 0 ? knownGuests / totalConversations : 0,
      contactableGuestRate: totalConversations > 0 ? contactableGuests / totalConversations : 0,
      knownGuestRateDelta: base.guestIdentitySplit.knownGuestRateDelta,
      contactableGuestRateDelta: base.guestIdentitySplit.contactableGuestRateDelta,
    }
  }

  // § 3 — Lead capture funnel
  if (live.leadCaptureFunnel.length > 0) {
    const started = sum(live.leadCaptureFunnel.map((r) => r.started))
    const engaged = sum(live.leadCaptureFunnel.map((r) => r.engaged))
    const askedBot = sum(live.leadCaptureFunnel.map((r) => r.asked_bot))
    const contacted = sum(live.leadCaptureFunnel.map((r) => r.contacted))
    const supportTouched = sum(live.leadCaptureFunnel.map((r) => r.support_touched))
    const counts = [started, engaged, askedBot, contacted, supportTouched]
    const labels = ['Conversation started', 'Guest engaged', 'Asked the bot', 'Contact captured', 'Support touched']
    const steps = counts.map((count, i) => ({
      label: labels[i],
      count,
      shareOfStarted: started > 0 ? count / started : 0,
      shareOfPreviousStep: i === 0 ? undefined : (counts[i - 1] > 0 ? count / counts[i - 1] : 0),
    }))
    out.leadCaptureFunnel = {
      steps,
      engagementRate: started > 0 ? engaged / started : 0,
      contactCaptureRate: started > 0 ? contacted / started : 0,
      supportTouchedRate: started > 0 ? supportTouched / started : 0,
    }
  }

  // § 4 — Device experience mix (device + browser sharing one view via `dimension`)
  if (live.deviceExperienceMix.length > 0) {
    const perDevice = new Map<string, { conversations: number; failed: number }>()
    const perBrowser = new Map<string, { conversations: number; failed: number }>()
    for (const r of live.deviceExperienceMix) {
      const target = r.dimension === 'device' ? perDevice : perBrowser
      const key = r.key ?? 'UNKNOWN'
      const prev = target.get(key) ?? { conversations: 0, failed: 0 }
      target.set(key, {
        conversations: prev.conversations + r.conversations,
        failed: prev.failed + r.failed_conversations,
      })
    }
    const knownDeviceTotal = [...perDevice.entries()]
      .filter(([k]) => k && k !== 'UNKNOWN')
      .reduce((s, [, v]) => s + v.conversations, 0)
    const devices = (['MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN'] as const).map((cat) => {
      const v = perDevice.get(cat) ?? { conversations: 0, failed: 0 }
      return {
        deviceCategory: cat,
        conversations: v.conversations,
        share: knownDeviceTotal > 0 && cat !== 'UNKNOWN' ? v.conversations / knownDeviceTotal : 0,
        failedConversations: v.failed,
        failedRate: v.conversations > 0 ? v.failed / v.conversations : 0,
      }
    })
    const totalBrowsers = [...perBrowser.values()].reduce((s, v) => s + v.conversations, 0)
    const browsers = [...perBrowser.entries()]
      .sort((a, b) => b[1].conversations - a[1].conversations)
      .slice(0, 8)
      .map(([browser, v]) => ({
        browser: browser || 'Other',
        conversations: v.conversations,
        share: totalBrowsers > 0 ? v.conversations / totalBrowsers : 0,
      }))
    const mobile = devices.find((d) => d.deviceCategory === 'MOBILE')?.share ?? 0
    const desktop = devices.find((d) => d.deviceCategory === 'DESKTOP')?.share ?? 0
    const tablet = devices.find((d) => d.deviceCategory === 'TABLET')?.share ?? 0
    out.deviceExperienceMix = {
      devices,
      browsers,
      mobileShare: mobile,
      desktopShare: desktop,
      tabletShare: tablet,
      mobileShareDelta: base.deviceExperienceMix.mobileShareDelta,
    }
  }

  // § 4 — Demand heatmap
  if (live.demandHeatmap.length > 0) {
    const cellMap = new Map<string, { conversations: number; userMessages: number }>()
    for (const r of live.demandHeatmap) {
      const k = `${r.day_of_week}|${r.time_bucket}`
      const prev = cellMap.get(k) ?? { conversations: 0, userMessages: 0 }
      cellMap.set(k, {
        conversations: prev.conversations + r.conversations,
        userMessages: prev.userMessages + r.user_messages,
      })
    }
    const cells = [...cellMap.entries()].map(([k, v]) => {
      const [dayOfWeek, timeBucket] = k.split('|')
      return {
        dayOfWeek: dayOfWeek as PeriodFixtures['demandHeatmap']['cells'][number]['dayOfWeek'],
        timeBucket: timeBucket as PeriodFixtures['demandHeatmap']['cells'][number]['timeBucket'],
        conversations: v.conversations,
        userMessages: v.userMessages,
      }
    })
    if (cells.length > 0) {
      let peak = cells[0]
      for (const c of cells) if (c.conversations > peak.conversations) peak = c
      const workingBuckets = new Set(['9AM–12PM', '12PM–3PM', '3PM–6PM'])
      const isWorking = (c: typeof cells[0]) =>
        c.dayOfWeek !== 'Sat' && c.dayOfWeek !== 'Sun' && workingBuckets.has(c.timeBucket)
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
      const merged = overlayMCChatLive(blankData(fixtureFallback), bundle!)
      setState({ data: merged, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
  }, [period, fixtureFallback])

  return state
}

/**
 * Lists every bot from the `public.bots` registry (id + name), which mirrors
 * Botscrew's admin_bot. This is the authoritative full list (~457 rows) WITH
 * names — small enough to fetch in one request (well under PostgREST's row cap),
 * unlike scanning report.outcome_timeline.
 *
 * Requires: GRANT SELECT ON public.bots TO anon;  (run once in Supabase)
 * Falls back to the three known bots when Supabase is unconfigured or the
 * grant/query fails.
 */
export interface BotOption {
  botId: number
  label: string       // bot display name (falls back to "Bot <id>")
  route: string       // canonical route to view this bot
}

const KNOWN_BOTS: BotOption[] = [
  { botId: 43,  label: 'Jackson Hole (chat)',        route: '/bot/43' },
  { botId: 2,   label: 'Mountain Collective (chat)',  route: '/bot/2' },
  { botId: 248, label: 'Mountain Collective (voice)', route: '/voice' },
]

export function useAvailableBots(): { bots: BotOption[]; isLive: boolean; isLoading: boolean } {
  const [state, setState] = useState({ bots: KNOWN_BOTS, isLive: false, isLoading: supabaseConfigured })

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    ;(async () => {
      const supabase = getSupabase()
      if (!supabase) return
      try {
        const { data, error } = await supabase
          .from('bots')
          .select('id, name')
          .order('name', { ascending: true })
          .limit(2000)
        if (cancelled) return
        if (error || !data || data.length === 0) {
          setState({ bots: KNOWN_BOTS, isLive: false, isLoading: false })
          return
        }
        const bots: BotOption[] = (data as { id: number; name: string | null }[])
          .filter((r) => r?.id != null)
          .map((r) => ({
            botId: r.id,
            label: r.name?.trim() || `Bot ${r.id}`,
            route: `/bot/${r.id}`,
          }))
        setState({ bots, isLive: true, isLoading: false })
      } catch {
        if (cancelled) return
        setState({ bots: KNOWN_BOTS, isLive: false, isLoading: false })
      }
    })()
    return () => { cancelled = true }
  }, [])

  return state
}

/**
 * Build chat fixtures for a given selection. Presets go through
 * `buildPeriodFixtures`; custom ranges go through the days-driven builder
 * with a human range label.
 */
function chatFixturesFor(selection: PeriodSelection): PeriodFixtures {
  if (selection.kind === 'preset') {
    return buildPeriodFixtures(selection.preset as PeriodKey)
  }
  const resolved = resolveSelection(selection)
  return buildPeriodFixturesForDays(resolved.days, resolved.label)
}

function voiceFixturesFor(selection: PeriodSelection): VoiceFixtures {
  if (selection.kind === 'preset') {
    return buildVoiceFixtures(selection.preset as VoicePeriodKey)
  }
  const resolved = resolveSelection(selection)
  return buildVoiceFixturesForDays(resolved.days, resolved.label)
}

// Stable key so useMemo/useEffect only recompute when the selection changes
function selectionKey(sel: PeriodSelection): string {
  return sel.kind === 'preset' ? `p:${sel.preset}` : `c:${sel.from}:${sel.to}`
}

/**
 * Generic hook — analytics for any bot_id. Used by the /bot/:botId route.
 */
export function useBotAnalytics(
  botId: number,
  selection: PeriodSelection,
): AnalyticsState<PeriodFixtures> {
  const [state, setState] = useState<AnalyticsState<PeriodFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const selKey = selectionKey(selection)
  const fixtureFallback = useMemo(() => chatFixturesFor(selection), [selKey])

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const { from, to } = resolveSelection(selection)
      const bundle = await fetchLiveBundle(botId, from, to)
      if (cancelled) return
      if (!bundleHasData(bundle)) {
        setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
        return
      }
      const merged = overlayJHChatLive(blankData(fixtureFallback), bundle!)
      setState({ data: merged, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
  }, [botId, selKey, fixtureFallback])

  return state
}

export function useJHChatAnalytics(selection: PeriodSelection): AnalyticsState<PeriodFixtures> {
  const [state, setState] = useState<AnalyticsState<PeriodFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const selKey = selectionKey(selection)
  const fixtureFallback = useMemo(() => chatFixturesFor(selection), [selKey])

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const { from, to } = resolveSelection(selection)
      const bundle = await fetchLiveBundle(BOT_ID_JH_CHAT, from, to)
      if (cancelled) return
      if (!bundleHasData(bundle)) {
        setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
        return
      }
      const merged = overlayJHChatLive(blankData(fixtureFallback), bundle!)
      setState({ data: merged, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
  }, [selKey, fixtureFallback])

  return state
}

export function useVoiceAnalytics(selection: PeriodSelection): AnalyticsState<VoiceFixtures> {
  const [state, setState] = useState<AnalyticsState<VoiceFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const selKey = selectionKey(selection)
  const fixtureFallback = useMemo(() => voiceFixturesFor(selection), [selKey])

  useEffect(() => {
    if (!supabaseConfigured) {
      setState({ data: fixtureFallback, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    ;(async () => {
      const { from, to } = resolveSelection(selection)
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
  }, [selKey, fixtureFallback])

  return state
}
