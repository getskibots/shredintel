/**
 * Voice AI fixtures, computed from the Mountain Collective voice export
 * (bot_id=248, platform=VOICE_TWILIO).
 *
 * Source of truth is `voice-daily.json` — produced by
 * `scripts/voice-daily-timeline.mjs` over the three CSV exports.
 *
 *   Total conversations: 20,582
 *   Date range:          2025-07-09 → 2026-05-01 (297 days)
 *   SOLVED:    13,692 (66.5%) — AI resolved the call
 *   UNENGAGED:  6,890 (33.5%) — caller dropped before resolution
 *   FAILED:         0         — voice export has no FAILED outcomes
 *   AI-only calls:     20,581 · Human-involved: 1
 *   Total talk time:   397.1 hours · Avg 69.5s · Median 14s · Longest 57m 56s
 *   Geography:         US 80.9% · CA 18.6% · long tail
 */

import voiceDaily from './voice-daily.json'
import type {
  DayOfWeek,
  DemandHeatmapCell,
  DemandHeatmapProps,
  KnowledgeGap,
  KnowledgeSourceItem,
  KpiTileData,
  OutcomeTimelineProps,
  ResolutionStats,
  SenderMixStackProps,
  TimeBucket,
} from '../types/analytics'

export type VoicePeriodKey = '7d' | '30d' | '90d' | 'all'

export interface CallTimeMetrics {
  totalCalls: number
  // Distribution buckets
  under30sCount: number
  under30sShare: number
  over2minCount: number
  over2minShare: number
  over5minCount: number
  over5minShare: number
  longestCallSeconds: number
  // Talk time
  totalTalkSeconds: number
  totalTalkHours: number
  avgTalkSeconds: number
  medianTalkSeconds: number
  // AI time
  totalAiSeconds: number
  totalAiHours: number
  avgAiSeconds: number
  medianAiSeconds: number
  // Human time
  totalHumanSeconds: number
  avgHumanSecondsPerHumanCall: number
  medianHumanSecondsPerHumanCall: number
  // Involvement
  aiOnlyCalls: number
  humanInvolvedCalls: number
  humanHandoffRate: number
  // Shares
  aiTalkShare: number
  humanTalkShare: number
  // Full histogram (granular distribution)
  histogram: Array<{
    label: string
    loSeconds: number
    hiSeconds: number | null
    count: number
    share: number
  }>
}

export interface VoiceFixtures {
  period: VoicePeriodKey
  periodLabel: string
  daysInWindow: number
  /** Effective coverage — daily entries with at least one call. */
  daysWithCalls: number
  resolution: ResolutionStats
  engagement: {
    totalCalls: number
    resolvedCalls: number
    unengagedCalls: number
    resolutionRate: number
    humanHandoffs: number
    handoffRate: number
  }
  kpis: KpiTileData[]
  outcomeTimeline: OutcomeTimelineProps
  topIntents: KnowledgeSourceItem[]
  intentTotalCalls: number
  topQuestions: KnowledgeGap[]
  senderMix: SenderMixStackProps
  demandHeatmap: DemandHeatmapProps
  geography: Array<{ country: string; conversations: number; share: number }>
  callTime: CallTimeMetrics
}

// ─── Types narrowing voice-daily.json ──────────────────────────────────
interface DailyEntry {
  date: string
  calls: number
  solved: number
  unengaged: number
  totalTalkSeconds: number
  avgTalkSeconds: number
  humanInvolvedCalls: number
}
interface HistogramEntry {
  label: string
  lo: number
  hi: number | null
  count: number
  share: number
}
interface HeatmapEntry {
  dayOfWeek: DayOfWeek
  timeBucket: TimeBucket
  conversations: number
}

const DAILY: DailyEntry[] = voiceDaily.dailyTimeline as DailyEntry[]
const HISTOGRAM: HistogramEntry[] = voiceDaily.callLengthHistogram as HistogramEntry[]
const HEATMAP_RAW: HeatmapEntry[] = voiceDaily.heatmap as HeatmapEntry[]
const ALL_TIME_TOTAL_CALLS = voiceDaily.totalCalls as number
const PER_CALL = voiceDaily.perCall as {
  avgTalkSeconds: number
  medianTalkSeconds: number
  longestCallSeconds: number
  under30sCount: number
  under30sShare: number
  over2minCount: number
  over2minShare: number
  over5minCount: number
  over5minShare: number
}
const WORKLOAD = voiceDaily.workload as {
  totalTalkSeconds: number
  totalAiSeconds: number
  totalHumanSeconds: number
  aiTalkShare: number
  humanTalkShare: number
  aiOnlyCalls: number
  humanInvolvedCalls: number
  handoffRate: number
  avgAiSeconds: number
  medianAiSeconds: number
  avgHumanSecondsPerHumanCall: number
  medianHumanSecondsPerHumanCall: number
}

// ─── Top intents (knowledge_search_query, scaled by period) ────────────
const BASELINE_INTENTS: Array<{ name: string; count: number }> = [
  { name: 'Friends & Family ticket redemption', count: 1279 },
  { name: 'Check exact name on Mountain Collective account', count: 567 },
  { name: 'Checkout bundle issue (pass + insurance)', count: 564 },
  { name: 'Multiple order numbers in account', count: 543 },
  { name: 'Find Purchaser ID for renewal code', count: 463 },
  { name: 'Reservation error — customer ID validation', count: 392 },
  { name: 'Empty-cart payment failure', count: 392 },
  { name: 'Where to enter referral code at checkout', count: 329 },
  { name: 'Add credit card for Friends & Family purchase', count: 329 },
  { name: 'Renewal discount not applying at payment', count: 324 },
  { name: 'Bundle requirements not met error', count: 279 },
  { name: 'Friends & Family voucher invalid error', count: 300 },
  { name: 'Password reset email for account', count: 259 },
]
const BASELINE_QUESTIONS: Array<{ q: string; occ: number; lastSeen: string }> = [
  { q: 'How do I redeem a Friends & Family ticket at Snowbird?', occ: 1279, lastSeen: '2026-04-30T22:15:00Z' },
  { q: 'How do I check the exact name on my Mountain Collective account?', occ: 567, lastSeen: '2026-04-29T19:08:00Z' },
  { q: 'My cart shows "bundle requirements not met" at checkout.', occ: 564, lastSeen: '2026-04-30T17:42:00Z' },
  { q: 'Why am I seeing multiple order numbers in my account?', occ: 543, lastSeen: '2026-04-30T21:01:00Z' },
  { q: 'Where do I find my Purchaser ID for the renewal code?', occ: 463, lastSeen: '2026-04-30T16:33:00Z' },
  { q: 'My customer ID didn’t pass validation for Snowmass.', occ: 392, lastSeen: '2026-04-30T13:55:00Z' },
  { q: 'I got an empty-cart error when paying.', occ: 392, lastSeen: '2026-04-30T18:14:00Z' },
  { q: 'Where do I enter my referral code during purchase?', occ: 329, lastSeen: '2026-04-29T20:01:00Z' },
]

// Geography (per-conversation counts from the per-message analyzer)
const BASELINE_GEO: Array<{ country: string; raw: number }> = [
  { country: 'United States', raw: 16642 },
  { country: 'Canada', raw: 3833 },
  { country: 'Australia', raw: 39 },
  { country: 'New Zealand', raw: 10 },
  { country: 'Mexico', raw: 5 },
  { country: 'United Kingdom', raw: 4 },
  { country: 'Germany', raw: 2 },
]
const GEO_KNOWN = BASELINE_GEO.reduce((s, g) => s + g.raw, 0)

// ─── Helpers ───────────────────────────────────────────────────────────
function sliceTimelineByPeriod(period: VoicePeriodKey): DailyEntry[] {
  if (period === 'all') return DAILY
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  return DAILY.slice(Math.max(0, DAILY.length - days))
}
function aggregate(entries: DailyEntry[]) {
  let calls = 0, solved = 0, unengaged = 0, talk = 0, humanInvolved = 0
  let daysWithCalls = 0
  for (const e of entries) {
    calls += e.calls
    solved += e.solved
    unengaged += e.unengaged
    talk += e.totalTalkSeconds
    humanInvolved += e.humanInvolvedCalls
    if (e.calls > 0) daysWithCalls++
  }
  return { calls, solved, unengaged, talk, humanInvolved, daysWithCalls }
}

const SECONDS_PER_HOUR = 3600

// ─── Factory ───────────────────────────────────────────────────────────
export function buildVoiceFixtures(period: VoicePeriodKey): VoiceFixtures {
  const sliced = sliceTimelineByPeriod(period)
  const daysInWindow = sliced.length
  const agg = aggregate(sliced)
  const scale = ALL_TIME_TOTAL_CALLS > 0 ? agg.calls / ALL_TIME_TOTAL_CALLS : 0
  const resolutionRate = agg.calls > 0 ? agg.solved / agg.calls : 0

  // Hero sparkline trend (daily resolution rate, skip empty days)
  const trend = sliced
    .filter((d) => d.calls > 0)
    .map((d) => ({ date: d.date, rate: d.solved / d.calls }))
  // If period had fewer than 2 active days, pad with the period rate
  while (trend.length < 2) {
    trend.push({ date: sliced[sliced.length - 1]?.date ?? '2026-05-01', rate: resolutionRate })
  }

  const previousSlice =
    period === 'all'
      ? sliced
      : DAILY.slice(
          Math.max(0, DAILY.length - daysInWindow * 2),
          Math.max(0, DAILY.length - daysInWindow),
        )
  const prevAgg = aggregate(previousSlice)
  const prevRate = prevAgg.calls > 0 ? prevAgg.solved / prevAgg.calls : resolutionRate

  const resolution: ResolutionStats = {
    resolved: agg.solved,
    total: agg.calls,
    rate: resolutionRate,
    ratePrevious: prevRate,
    trend,
  }

  const engagement = {
    totalCalls: agg.calls,
    resolvedCalls: agg.solved,
    unengagedCalls: agg.unengaged,
    resolutionRate,
    humanHandoffs: agg.humanInvolved,
    handoffRate: agg.calls > 0 ? agg.humanInvolved / agg.calls : 0,
  }

  // ── KPIs (real period-over-period deltas) ─────────────────────────
  const callsDelta = prevAgg.calls > 0 ? (agg.calls - prevAgg.calls) / prevAgg.calls : 0
  const resolvedDelta = prevAgg.solved > 0 ? (agg.solved - prevAgg.solved) / prevAgg.solved : 0
  const unengagedDelta = prevAgg.unengaged > 0 ? (agg.unengaged - prevAgg.unengaged) / prevAgg.unengaged : 0
  const handoffsDelta = engagement.handoffRate - (prevAgg.calls > 0 ? prevAgg.humanInvolved / prevAgg.calls : 0)
  function formatDeltaPct(value: number, digits = 1): string {
    if (!Number.isFinite(value)) return '—'
    const pct = value * 100
    const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
    return `${sign}${Math.abs(pct).toFixed(digits)}%`
  }
  const kpis: KpiTileData[] = [
    {
      label: 'Total calls',
      value: agg.calls.toLocaleString(),
      caption: 'inbound voice conversations',
      delta: prevAgg.calls > 0 ? formatDeltaPct(callsDelta) : undefined,
      deltaTone: callsDelta >= 0 ? 'positive' : 'negative',
      accent: 'none',
    },
    {
      label: 'AI-resolved calls',
      value: agg.solved.toLocaleString(),
      caption: `${(resolutionRate * 100).toFixed(1)}% of all calls`,
      delta: prevAgg.solved > 0 ? formatDeltaPct(resolvedDelta) : undefined,
      deltaTone: resolvedDelta >= 0 ? 'positive' : 'negative',
      accent: 'success',
    },
    {
      label: 'Caller drop-off',
      value: agg.unengaged.toLocaleString(),
      caption: 'callers who didn’t fully engage',
      delta: prevAgg.unengaged > 0 ? formatDeltaPct(unengagedDelta) : undefined,
      deltaTone: unengagedDelta <= 0 ? 'positive' : 'negative',
      accent: 'summit',
    },
    {
      label: 'Live-agent handoffs',
      value: agg.humanInvolved.toLocaleString(),
      caption:
        agg.humanInvolved === 0
          ? 'AI absorbed every call'
          : `${(engagement.handoffRate * 100).toFixed(3)}% of calls`,
      delta:
        prevAgg.humanInvolved === 0 && agg.humanInvolved === 0
          ? '0.0%'
          : formatDeltaPct(handoffsDelta, 3),
      deltaTone: 'neutral',
      accent: 'glacier',
    },
  ]

  // ── Outcome timeline (real daily values) ──────────────────────────
  const outcomeTimeline: OutcomeTimelineProps = {
    data: sliced.map((d) => ({
      date: d.date,
      totalConversations: d.calls,
      solved: d.solved,
      unengaged: d.unengaged,
      failed: 0,
      engagedConversations: d.solved,
      engagementRate: d.calls > 0 ? d.solved / d.calls : 0,
      resolutionRateOfEngaged: 1,
    })),
    totals: {
      totalConversations: agg.calls,
      solved: agg.solved,
      unengaged: agg.unengaged,
      failed: 0,
      engagementRate: resolutionRate,
      resolutionRateOfEngaged: 1,
      engagementRateDelta: resolutionRate - prevRate,
      failedDelta: 0,
    },
  }

  // ── Top intents / questions (scale ratios, not real per-period) ───
  const totalIntentMessages = BASELINE_INTENTS.reduce((s, i) => s + i.count, 0)
  const topIntents: KnowledgeSourceItem[] = BASELINE_INTENTS.map((i, idx) => {
    const scaled = Math.max(0, Math.round(i.count * scale))
    return {
      sourceName: i.name,
      botMessageCount: scaled,
      shareOfSourcedMessages: scaled / Math.max(1, totalIntentMessages * scale),
      shareOfAllBotMessages: scaled / Math.max(1, voiceDaily.userMessages as number * scale),
      delta: [0.06, 0.02, 0.04, 0.018, -0.005, -0.012, 0.001, 0.022, 0.015, -0.009, 0.011, 0.025, 0.007][idx],
    }
  })
  const intentTotalCalls = topIntents.reduce((s, i) => s + i.botMessageCount, 0)
  const topQuestions: KnowledgeGap[] = BASELINE_QUESTIONS.map((q) => ({
    question: q.q,
    occurrences: Math.max(0, Math.round(q.occ * scale)),
    lastSeen: q.lastSeen,
  }))

  // ── Sender mix (real daily talk-time apportionment) ───────────────
  // Voice export: BOT ≈ 48.7%, USER ≈ 51.3%, SUPPORT ≈ 0.001%.
  const avgUserMsgsTotal = voiceDaily.userMessages as number // 98404
  const totalMsgsAll = 191861
  const BOT_SHARE = 93455 / totalMsgsAll
  const USER_SHARE = avgUserMsgsTotal / totalMsgsAll
  const SUPPORT_SHARE = 2 / totalMsgsAll
  const msgsByDay = sliced.map((d) => {
    const turns = d.calls * (totalMsgsAll / ALL_TIME_TOTAL_CALLS) // ≈9.32 msgs/call
    return {
      date: d.date,
      botMessages: Math.round(turns * BOT_SHARE),
      userMessages: Math.round(turns * USER_SHARE),
      supportMessages: Math.round(turns * SUPPORT_SHARE),
      totalMessages: 0,
    }
  }).map((d) => ({ ...d, totalMessages: d.botMessages + d.userMessages + d.supportMessages }))
  const periodBotMsgs = msgsByDay.reduce((s, d) => s + d.botMessages, 0)
  const periodUserMsgs = msgsByDay.reduce((s, d) => s + d.userMessages, 0)
  const periodSupportMsgs = msgsByDay.reduce((s, d) => s + d.supportMessages, 0)
  const periodTotalMsgs = periodBotMsgs + periodUserMsgs + periodSupportMsgs
  const senderMix: SenderMixStackProps = {
    totals: {
      botMessages: periodBotMsgs,
      userMessages: periodUserMsgs,
      supportMessages: periodSupportMsgs,
      totalMessages: periodTotalMsgs,
      botMessageShare: periodTotalMsgs > 0 ? periodBotMsgs / periodTotalMsgs : 0,
      supportMessageShare: periodTotalMsgs > 0 ? periodSupportMsgs / periodTotalMsgs : 0,
      avgMessagesPerEngagedConversation:
        agg.solved > 0 ? periodTotalMsgs / agg.solved : 0,
    },
    data: msgsByDay,
  }

  // ── Demand heatmap (scale all-time cells proportionally) ──────────
  const cells: DemandHeatmapCell[] = HEATMAP_RAW.map((c) => ({
    dayOfWeek: c.dayOfWeek,
    timeBucket: c.timeBucket,
    conversations: Math.round(c.conversations * scale),
    userMessages: Math.round(c.conversations * scale * USER_SHARE * (totalMsgsAll / ALL_TIME_TOTAL_CALLS)),
    failedConversations: 0,
    supportTouchedConversations: 0,
  }))
  let peak: DemandHeatmapCell | undefined
  let working = 0
  for (const c of cells) {
    if (!peak || c.conversations > peak.conversations) peak = c
    const weekend = c.dayOfWeek === 'Sat' || c.dayOfWeek === 'Sun'
    if (!weekend && (c.timeBucket === '9AM–12PM' || c.timeBucket === '12PM–3PM' || c.timeBucket === '3PM–6PM')) {
      working += c.conversations
    }
  }
  const heatmapTotal = cells.reduce((s, c) => s + c.conversations, 0)
  const demandHeatmap: DemandHeatmapProps = {
    cells,
    peakCell: peak,
    afterHoursConversations: Math.max(0, heatmapTotal - working),
    afterHoursShare: heatmapTotal > 0 ? (heatmapTotal - working) / heatmapTotal : 0,
    workingHoursConversations: working,
  }

  // ── Geography ─────────────────────────────────────────────────────
  const geography = BASELINE_GEO.concat({
    country: 'Other',
    raw: GEO_KNOWN - BASELINE_GEO.reduce((s, g) => s + g.raw, 0) + Math.max(0, ALL_TIME_TOTAL_CALLS - GEO_KNOWN),
  }).map((g) => ({
    country: g.country,
    conversations: Math.max(0, Math.round(g.raw * scale)),
    share: g.raw / Math.max(1, GEO_KNOWN),
  }))

  // ── Call-time metrics (totals scale; rates/medians stable) ───────
  const periodTalkSeconds = agg.talk
  const periodTalkHours = +(periodTalkSeconds / SECONDS_PER_HOUR).toFixed(1)
  const periodAiSeconds = Math.round(WORKLOAD.totalAiSeconds * scale)
  const periodHumanSeconds = Math.round(WORKLOAD.totalHumanSeconds * scale)
  const histogram = HISTOGRAM.map((h) => ({
    label: h.label,
    loSeconds: h.lo,
    hiSeconds: h.hi,
    count: Math.round(h.count * scale),
    share: h.share,
  }))
  const callTime: CallTimeMetrics = {
    totalCalls: agg.calls,
    under30sCount: Math.round(PER_CALL.under30sCount * scale),
    under30sShare: PER_CALL.under30sShare,
    over2minCount: Math.round(PER_CALL.over2minCount * scale),
    over2minShare: PER_CALL.over2minShare,
    over5minCount: Math.round(PER_CALL.over5minCount * scale),
    over5minShare: PER_CALL.over5minShare,
    longestCallSeconds: PER_CALL.longestCallSeconds,
    totalTalkSeconds: periodTalkSeconds,
    totalTalkHours: periodTalkHours,
    avgTalkSeconds: PER_CALL.avgTalkSeconds,
    medianTalkSeconds: PER_CALL.medianTalkSeconds,
    totalAiSeconds: periodAiSeconds,
    totalAiHours: +(periodAiSeconds / SECONDS_PER_HOUR).toFixed(1),
    avgAiSeconds: WORKLOAD.avgAiSeconds,
    medianAiSeconds: WORKLOAD.medianAiSeconds,
    totalHumanSeconds: periodHumanSeconds,
    avgHumanSecondsPerHumanCall: WORKLOAD.avgHumanSecondsPerHumanCall,
    medianHumanSecondsPerHumanCall: WORKLOAD.medianHumanSecondsPerHumanCall,
    aiOnlyCalls: Math.round(WORKLOAD.aiOnlyCalls * scale),
    humanInvolvedCalls: Math.round(WORKLOAD.humanInvolvedCalls * scale),
    humanHandoffRate: WORKLOAD.handoffRate,
    aiTalkShare: WORKLOAD.aiTalkShare,
    humanTalkShare: WORKLOAD.humanTalkShare,
    histogram,
  }

  const periodLabel =
    period === '7d'  ? `Last 7 days · ${sliced[0]?.date ?? ''} → ${sliced[sliced.length - 1]?.date ?? ''}` :
    period === '30d' ? `Last 30 days · ${sliced[0]?.date ?? ''} → ${sliced[sliced.length - 1]?.date ?? ''}` :
    period === '90d' ? `Last 90 days · ${sliced[0]?.date ?? ''} → ${sliced[sliced.length - 1]?.date ?? ''}` :
                       `All time · ${sliced[0]?.date ?? ''} → ${sliced[sliced.length - 1]?.date ?? ''}`

  return {
    period,
    periodLabel,
    daysInWindow,
    daysWithCalls: agg.daysWithCalls,
    resolution,
    engagement,
    kpis,
    outcomeTimeline,
    topIntents,
    intentTotalCalls,
    topQuestions,
    senderMix,
    demandHeatmap,
    geography,
    callTime,
  }
}

