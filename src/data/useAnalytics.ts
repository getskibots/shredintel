import { useEffect, useMemo, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import { fetchLiveBundle, periodDates, type LiveBundle, type PageFunnelRow, type PageIntelRow, type IntelBreakdownRow } from './queries'
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
function overlayJHChatLive(base: PeriodFixtures, live: LiveBundle, pageStage?: string | null): PeriodFixtures {
  const out: PeriodFixtures = { ...base }

  // Global page filter: when a funnel stage is selected, the intelligence panels
  // (§2 sections / blockers / sentiment) re-scope to conversations that originated
  // on that stage's pages — sourced from the stage-dimensioned page_* views. When
  // no stage is selected they use the whole-bot intel_* views.
  const stage = pageStage && pageStage.length > 0 ? pageStage : null
  const toIntel = (rows: PageIntelRow[]): IntelBreakdownRow[] =>
    rows
      .filter((r) => r.funnel_stage === stage)
      .map((r) => ({ bot_id: r.bot_id, day: r.day, key: r.key, conversations: r.conversations, negative: r.negative }))
  const sectionRows = stage ? toIntel(live.pageSection) : live.intelSection
  const pinchRows = stage ? toIntel(live.pagePinchpoint) : live.intelPinchpoint
  const sentRows = stage ? toIntel(live.pageSentiment) : live.intelSentiment

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

  // § 1 — Conversation counts (Extended Conversation Counts)
  if (live.conversationDepth.length > 0) {
    const rows = live.conversationDepth
    const sessions = sum(rows.map((r) => Number(r.conversations)))
    const engagedSessions = sum(rows.map((r) => Number(r.engaged_conversations)))
    const singleUserMsgSessions = sum(rows.map((r) => Number(r.single_user_msg_sessions)))
    const userMessages = sum(rows.map((r) => Number(r.user_messages)))
    const messages = sum(rows.map((r) => Number(r.total_messages)))
    // Users = distinct visitors in the window (matches Botscrew "Active users").
    // Substantive = the AI's analysis base = Σ intel_section (each substantive
    // conversation appears once) — same number the enrichment panels use.
    const users = live.activeUsers ?? undefined
    const substantive = live.intelSection.length > 0
      ? sum(live.intelSection.map((r) => Number(r.conversations)))
      : undefined
    // Exact period avg first-response = Σ(sum_sec) / Σ(responded); NULL until the
    // response-time enrichment view lands (columns arrive null for now).
    out.conversationCounts = {
      users,
      substantive,
      sessions,
      messages,
      userMessages,
      engagedSessions,
      singleUserMsgSessions,
      singleMsgShareOfEngaged: engagedSessions > 0 ? singleUserMsgSessions / engagedSessions : 0,
      messagesPerSession: sessions > 0 ? messages / sessions : 0,
      userMessagesPerSession: sessions > 0 ? userMessages / sessions : 0,
      avgUserMsgsPerEngaged: engagedSessions > 0 ? userMessages / engagedSessions : 0,
      avgFirstResponseSec: null,
      medianFirstResponseSec: null,
      sessionsDelta: undefined, // no honest prior-window fetch yet
      messagesDelta: undefined,
      trend: rows.map((r) => ({
        date: r.day,
        sessions: Number(r.conversations),
        engaged: Number(r.engaged_conversations),
        messages: Number(r.total_messages),
        userMessages: Number(r.user_messages),
      })),
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

  // § 2 — Knowledge layers: where answers come from, by Botscrew Knowledge Layer
  if (live.knowledgeLayerMix.length > 0) {
    const byLayer = new Map<string, number>()
    for (const r of live.knowledgeLayerMix) {
      byLayer.set(r.layer, (byLayer.get(r.layer) ?? 0) + r.answers)
    }
    const layers = [...byLayer.entries()]
      .map(([layer, answers]) => ({ layer, answers }))
      .sort((a, b) => b.answers - a.answers)

    // Per-topic mix (the fill-list) — sum answers by (section, layer)
    const byTopicMap = new Map<string, Map<string, number>>()
    for (const r of live.knowledgeLayerBySection) {
      const m = byTopicMap.get(r.section) ?? new Map<string, number>()
      m.set(r.layer, (m.get(r.layer) ?? 0) + r.answers)
      byTopicMap.set(r.section, m)
    }
    const byTopic = [...byTopicMap.entries()]
      .map(([section, m]) => {
        const tl = [...m.entries()].map(([layer, answers]) => ({ layer, answers }))
        return { section, total: tl.reduce((s, l) => s + l.answers, 0), layers: tl }
      })
      .sort((a, b) => b.total - a.total)

    if (layers.length > 0) {
      out.knowledgeLayers = { layers, byTopic: byTopic.length > 0 ? byTopic : undefined }
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

  // § 2 — ShredIntel enrichment (section demand / pinchpoints / sentiment)
  const aggIntel = (rows: LiveBundle['intelSection']) => {
    const m = new Map<string, { c: number; neg: number }>()
    for (const r of rows) {
      const prev = m.get(r.key) ?? { c: 0, neg: 0 }
      m.set(r.key, { c: prev.c + Number(r.conversations), neg: prev.neg + Number(r.negative ?? 0) })
    }
    return m
  }
  const sumMap = (m: Map<string, { c: number; neg: number }>) =>
    [...m.values()].reduce((s, v) => s + v.c, 0)

  const sentMap = aggIntel(sentRows)
  const substantiveTotal = sumMap(sentMap) || sumMap(aggIntel(sectionRows))

  if (sectionRows.length > 0) {
    const sections = [...aggIntel(sectionRows).entries()]
      .map(([label, v]) => ({ label, conversations: v.c, share: substantiveTotal > 0 ? v.c / substantiveTotal : 0 }))
      .sort((a, b) => b.conversations - a.conversations)
    out.knowledgeSectionDemand = { sections, totalSubstantive: substantiveTotal }
  }
  if (pinchRows.length > 0) {
    const m = aggIntel(pinchRows)
    const blockers = [...m.entries()]
      .map(([label, v]) => ({ label, conversations: v.c, share: substantiveTotal > 0 ? v.c / substantiveTotal : 0, negative: v.neg }))
      .sort((a, b) => b.conversations - a.conversations)
    const affected = sumMap(m)
    out.conversionBlockers = {
      blockers, affectedConversations: affected,
      affectedShare: substantiveTotal > 0 ? affected / substantiveTotal : 0,
    }
  }
  if (sentRows.length > 0) {
    const g = (k: string) => sentMap.get(k)?.c ?? 0
    const positive = g('Positive'), neutral = g('Neutral'), negative = g('Negative')
    out.guestSentiment = {
      positive, neutral, negative, total: substantiveTotal,
      positiveShare: substantiveTotal > 0 ? positive / substantiveTotal : 0,
      negativeShare: substantiveTotal > 0 ? negative / substantiveTotal : 0,
    }
  }

  // § "Are we helping?" — human handover need (No/Possible/Clear) vs actual
  // escalation (support_touched from the lead-capture funnel), + the gap.
  if (live.intelHandover.length > 0) {
    const hm = new Map<string, number>()
    for (const r of live.intelHandover) hm.set(r.key, (hm.get(r.key) ?? 0) + Number(r.conversations))
    const no = hm.get('No Handover') ?? 0
    const possible = hm.get('Possible Handover') ?? 0
    const clear = (hm.get('Clear Handover') ?? 0) + (hm.get('Escalation Required') ?? 0)
    const total = no + possible + clear
    if (total > 0) {
      const escalated = sum(live.leadCaptureFunnel.map((r) => Number(r.support_touched)))
      out.humanHandover = {
        segments: [
          { label: 'Handled by bot', conversations: no, share: no / total },
          { label: 'Possible handover', conversations: possible, share: possible / total },
          { label: 'Clear handover', conversations: clear, share: clear / total },
        ],
        totalSubstantive: total,
        neededHuman: possible + clear,
        neededHumanShare: (possible + clear) / total,
        clearHandover: clear,
        escalated,
        gap: Math.max(0, clear - escalated),
      }
    }
  }

  // § "Needs attention" — urgency mix (High + Escalation Required = urgent now).
  if (live.intelUrgency.length > 0) {
    const um = new Map<string, number>()
    for (const r of live.intelUrgency) um.set(r.key, (um.get(r.key) ?? 0) + Number(r.conversations))
    const total = [...um.values()].reduce((s, v) => s + v, 0)
    if (total > 0) {
      const escalation = um.get('Escalation Required') ?? 0
      const urgent = (um.get('High') ?? 0) + escalation
      out.needsAttention = {
        segments: ['Low', 'Medium', 'High', 'Escalation Required'].map((label) => {
          const c = um.get(label) ?? 0
          return { label, conversations: c, share: total > 0 ? c / total : 0 }
        }),
        total,
        urgent,
        urgentShare: total > 0 ? urgent / total : 0,
        escalation,
      }
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

  // § 4 — Guest locations (offline IP → geo). Market split from geo_country,
  // top cities from geo_city (aggregated across the window's days).
  if (live.geoCountry.length > 0 || live.geoCity.length > 0) {
    const perCountry = new Map<string, number>()
    for (const r of live.geoCountry) perCountry.set(r.country_iso, (perCountry.get(r.country_iso) ?? 0) + Number(r.conversations))
    const totalLocated = [...perCountry.values()].reduce((s, v) => s + v, 0)
    const us = perCountry.get('US') ?? 0
    const ca = perCountry.get('CA') ?? 0
    const intl = totalLocated - us - ca
    const share = (n: number) => (totalLocated > 0 ? n / totalLocated : 0)
    const markets = [
      { label: 'United States', conversations: us, share: share(us) },
      { label: 'Canada', conversations: ca, share: share(ca) },
      { label: 'International', conversations: intl, share: share(intl) },
    ].filter((m) => m.conversations > 0)

    // Cities keyed by "City, Region" for display; the drill parses the city out.
    const perCity = new Map<string, number>()
    for (const r of live.geoCity) {
      const label = r.region ? `${r.city}, ${r.region}` : r.city
      perCity.set(label, (perCity.get(label) ?? 0) + Number(r.conversations))
    }
    const cities = [...perCity.entries()]
      .map(([label, n]) => ({ label, conversations: n, share: share(n) }))
      .sort((a, b) => b.conversations - a.conversations)
      .slice(0, 12)

    // Map points keyed by raw city (with coords) for the US dot-map.
    const perPoint = new Map<string, { lat: number; lon: number; n: number }>()
    for (const r of live.geoCity) {
      if (r.lat == null || r.lon == null) continue
      const prev = perPoint.get(r.city) ?? { lat: r.lat, lon: r.lon, n: 0 }
      perPoint.set(r.city, { lat: r.lat, lon: r.lon, n: prev.n + Number(r.conversations) })
    }
    const cityPoints = [...perPoint.entries()]
      .map(([city, v]) => ({ city, lat: v.lat, lon: v.lon, conversations: v.n }))
      .sort((a, b) => b.conversations - a.conversations)
      .slice(0, 60)

    if (totalLocated > 0) {
      out.guestLocations = { cities, cityPoints, markets, totalLocated, countryCount: perCountry.size }
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

// ─── Page funnel ─────────────────────────────────────────────────────────

export interface FunnelStageSummary {
  stage: string
  rank: number
  conversations: number
  negative: number
  negativeShare: number
}

export interface PageFunnelSummary {
  stages: FunnelStageSummary[] // ordered by funnel rank (Home → Account)
  totalConversations: number
  maxConversations: number // for bar scaling
}

/** Roll daily page_funnel rows up into ordered per-stage totals + friction. */
function summarizeFunnel(rows: PageFunnelRow[]): PageFunnelSummary | null {
  if (!rows || rows.length === 0) return null
  const m = new Map<string, { rank: number; conversations: number; negative: number }>()
  for (const r of rows) {
    const prev = m.get(r.funnel_stage) ?? { rank: r.stage_rank, conversations: 0, negative: 0 }
    m.set(r.funnel_stage, {
      rank: r.stage_rank,
      conversations: prev.conversations + Number(r.conversations),
      negative: prev.negative + Number(r.negative ?? 0),
    })
  }
  const stages = [...m.entries()]
    .map(([stage, v]) => ({
      stage,
      rank: v.rank,
      conversations: v.conversations,
      negative: v.negative,
      negativeShare: v.conversations > 0 ? v.negative / v.conversations : 0,
    }))
    .sort((a, b) => a.rank - b.rank)
  const totalConversations = stages.reduce((s, v) => s + v.conversations, 0)
  const maxConversations = stages.reduce((mx, v) => Math.max(mx, v.conversations), 0)
  if (totalConversations === 0) return null
  return { stages, totalConversations, maxConversations }
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
  route: string       // canonical route to view this bot (channel-aware)
  channel?: 'chat' | 'voice' // from report.bot_channel — drives picker split + routing
  vertical?: string          // from report.bot_vertical — auto-detected business vertical
  publicIdentifier?: string  // Botscrew UUID → derives the widget test URL
}

const KNOWN_BOTS: BotOption[] = [
  { botId: 43,  label: 'Jackson Hole (chat)',        route: '/bot/43',   channel: 'chat',  publicIdentifier: '776bd241-fbc3-4e17-92c7-8af31e84e6dd' },
  { botId: 2,   label: 'Mountain Collective (chat)',  route: '/bot/2',    channel: 'chat' },
  { botId: 248, label: 'Mountain Collective (voice)', route: '/voice/248', channel: 'voice' },
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
        // Prefer public_identifier (the widget UUID → derives the test URL); if
        // that column isn't exposed yet, fall back to id+name so the list loads.
        type BotRow = { id: number; name: string | null; public_identifier?: string | null }
        type Res = { data: BotRow[] | null; error: unknown }
        let res = (await supabase
          .from('bots')
          .select('id, name, public_identifier')
          .order('name', { ascending: true })
          .limit(2000)) as Res
        if (res.error) {
          res = (await supabase
            .from('bots')
            .select('id, name')
            .order('name', { ascending: true })
            .limit(2000)) as Res
        }
        const { data, error } = res
        if (cancelled) return
        if (error || !data || data.length === 0) {
          setState({ bots: KNOWN_BOTS, isLive: false, isLoading: false })
          return
        }
        // Channel per bot (report.bot_channel) → drives the picker split + routing.
        // Non-fatal: default 'chat' if the view isn't reachable.
        const chMap = new Map<number, 'chat' | 'voice'>()
        try {
          const ch = (await supabase
            .schema('report')
            .from('bot_channel')
            .select('bot_id, channel')
            .limit(2000)) as { data: { bot_id: number; channel: string }[] | null; error: unknown }
          if (!ch.error && ch.data) for (const r of ch.data) chMap.set(r.bot_id, r.channel === 'voice' ? 'voice' : 'chat')
        } catch { /* non-fatal */ }
        // Vertical per bot (report.bot_vertical) → labels + groups the directory.
        const vMap = new Map<number, string>()
        try {
          const vv = (await supabase
            .schema('report')
            .from('bot_vertical')
            .select('bot_id, vertical')
            .limit(2000)) as { data: { bot_id: number; vertical: string }[] | null; error: unknown }
          if (!vv.error && vv.data) for (const r of vv.data) vMap.set(r.bot_id, r.vertical)
        } catch { /* non-fatal */ }
        if (cancelled) return
        const bots: BotOption[] = data
          .filter((r) => r?.id != null)
          .map((r) => {
            const channel = chMap.get(r.id) ?? 'chat'
            return {
              botId: r.id,
              label: r.name?.trim() || `Bot ${r.id}`,
              channel,
              vertical: vMap.get(r.id),
              route: channel === 'voice' ? `/voice/${r.id}` : `/bot/${r.id}`,
              publicIdentifier: r.public_identifier || undefined,
            }
          })
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
 * The channel ('chat' | 'voice') for a single bot, from report.bot_channel.
 * Drives the /bot/:botId dispatcher so voice bots render the voice card — and the
 * Botscrew embed (which always opens /bot/{id}) auto-covers voice bots with no
 * loader change. Defaults to 'chat' when Supabase is unconfigured or no channel row.
 */
export function useBotChannel(botId: number): { channel: 'chat' | 'voice'; isLoading: boolean } {
  const [state, setState] = useState<{ channel: 'chat' | 'voice'; isLoading: boolean }>({
    channel: 'chat',
    isLoading: supabaseConfigured,
  })

  useEffect(() => {
    if (!supabaseConfigured || !Number.isFinite(botId)) {
      setState({ channel: 'chat', isLoading: false })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) { setState({ channel: 'chat', isLoading: false }); return }
        const { data } = (await supabase
          .schema('report')
          .from('bot_channel')
          .select('channel')
          .eq('bot_id', botId)
          .maybeSingle()) as { data: { channel: string } | null; error: unknown }
        if (cancelled) return
        setState({ channel: data?.channel === 'voice' ? 'voice' : 'chat', isLoading: false })
      } catch {
        if (cancelled) return
        setState({ channel: 'chat', isLoading: false })
      }
    })()
    return () => { cancelled = true }
  }, [botId])

  return state
}

/** The auto-detected vertical (+ any secondary facets) for a single bot, from
 *  report.bot_vertical. `also` is the composite facets (e.g. ski + water park).
 *  Empty/null until detected or when Supabase is unconfigured. For header badges. */
export function useBotVertical(botId: number): { vertical: string | null; also: string[] } {
  const [state, setState] = useState<{ vertical: string | null; also: string[] }>({ vertical: null, also: [] })
  useEffect(() => {
    if (!supabaseConfigured || !Number.isFinite(botId)) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const { data } = (await supabase
          .schema('report')
          .from('bot_vertical')
          .select('vertical, also')
          .eq('bot_id', botId)
          .maybeSingle()) as { data: { vertical: string; also: string[] | null } | null; error: unknown }
        if (!cancelled) setState({ vertical: data?.vertical ?? null, also: data?.also ?? [] })
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [botId])
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

export interface BotAnalyticsState extends AnalyticsState<PeriodFixtures> {
  /** Where questions originate (ecommerce funnel). null unless live + populated. */
  funnel: PageFunnelSummary | null
  /** True when the live query succeeded but this bot has no data in the window
   *  (so the page can show one clean empty banner instead of a stack of empties). */
  isEmpty: boolean
}

/**
 * Generic hook — analytics for any bot_id. Used by the /bot/:botId route.
 * `pageStage` (a funnel_stage label, or null) re-scopes the intelligence panels
 * to conversations that originated on that stage's pages — recomputed from the
 * cached bundle, so toggling the stage never refetches.
 */
export function useBotAnalytics(
  botId: number,
  selection: PeriodSelection,
  pageStage: string | null = null,
): BotAnalyticsState {
  const [raw, setRaw] = useState<{ bundle: LiveBundle | null; isLoading: boolean; isLive: boolean; error: Error | null }>({
    bundle: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const selKey = selectionKey(selection)
  const fixtureFallback = useMemo(() => chatFixturesFor(selection), [selKey])

  useEffect(() => {
    if (!supabaseConfigured) {
      setRaw({ bundle: null, isLoading: false, isLive: false, error: null })
      return
    }
    let cancelled = false
    setRaw((s) => ({ ...s, isLoading: true }))
    ;(async () => {
      const { from, to } = resolveSelection(selection)
      const bundle = await fetchLiveBundle(botId, from, to)
      if (cancelled) return
      if (!bundleHasData(bundle)) {
        // Live query succeeded, but this bot has no data in the window. Show honest
        // zeros / per-panel empty states — NOT the demo fixtures (Jackson Hole sample
        // data), which would misrepresent this bot on short/sparse windows.
        setRaw({ bundle: null, isLoading: false, isLive: true, error: null })
        return
      }
      setRaw({ bundle, isLoading: false, isLive: true, error: null })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, selKey])

  const data = useMemo(
    () =>
      raw.bundle
        ? overlayJHChatLive(blankData(fixtureFallback), raw.bundle, pageStage)
        : raw.isLive
          ? blankData(fixtureFallback) // live query, no data in this window → honest zeros
          : fixtureFallback, // Supabase not configured (local dev) → demo fixtures
    [raw.bundle, raw.isLive, fixtureFallback, pageStage],
  )
  const funnel = useMemo(() => (raw.bundle ? summarizeFunnel(raw.bundle.pageFunnel) : null), [raw.bundle])

  // Live query returned, but this bot has no rows in the window (bundle stayed null
  // while isLive is true). Lets the page show one clean banner, not a wall of empties.
  const isEmpty = raw.isLive && !raw.bundle
  return { data, funnel, isLoading: raw.isLoading, isLive: raw.isLive, error: raw.error, isEmpty }
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
