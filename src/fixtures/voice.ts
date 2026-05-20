/**
 * Voice AI fixtures, anchored to the Mountain Collective voice export
 * (bot_id=248, platform=VOICE_TWILIO).
 *
 * Baseline (raw counts across 2025-07-09 → 2026-05-01, ~297 days):
 *   Total conversations: 20,582
 *   SOLVED:    13,692 (66.5%) — AI resolved the call
 *   UNENGAGED:  6,890 (33.5%) — caller dropped before resolution
 *   FAILED:         0
 *   USER msgs: 98,404 · BOT msgs: 93,455 · SUPPORT msgs: 2
 *   → Effective AI deflection: 99.999% (only 2 human-agent messages logged)
 *   Geography: US 80.9% · CA 18.6% · long tail
 *   No device/browser data (voice doesn't have it)
 *   No FrictionMap / Lead-capture (no page_url, no email)
 */

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
  // Talk time (total)
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
  // Workload shares
  aiTalkShare: number
  humanTalkShare: number
}

export interface VoiceFixtures {
  period: VoicePeriodKey
  periodLabel: string
  daysInWindow: number
  resolution: ResolutionStats
  /** Voice-shaped engagement: total calls, AI-resolved, abandoned (UNENGAGED) */
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
  /** Top voice intents (from knowledge_search_query) */
  topIntents: KnowledgeSourceItem[]
  intentTotalCalls: number
  /** Top spoken issues (the ones the bot should add to its KB or playbook) */
  topQuestions: KnowledgeGap[]
  senderMix: SenderMixStackProps
  demandHeatmap: DemandHeatmapProps
  geography: Array<{ country: string; conversations: number; share: number }>
  /** Call-time metrics computed from message timestamps (estimates). */
  callTime: CallTimeMetrics
}

const TOTAL_DAYS = 297
const TOTAL_CALLS = 20582
const TOTAL_SOLVED = 13692
const TOTAL_BOT_MSGS = 93455
const TOTAL_USER_MSGS = 98404
const TOTAL_SUPPORT_MSGS = 2
const TOTAL_MSGS = TOTAL_BOT_MSGS + TOTAL_USER_MSGS + TOTAL_SUPPORT_MSGS
const AVG_MSGS_PER_ENGAGED = TOTAL_MSGS / TOTAL_SOLVED // ~14.0
const END_DATE = '2026-05-01'

function generateDates(days: number, end = END_DATE): string[] {
  const endDate = new Date(end + 'T00:00:00Z')
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(endDate)
    d.setUTCDate(endDate.getUTCDate() - (days - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

// Day-of-week distribution (Sun..Sat) from the export
const dowWeights: Record<number, number> = {
  0: 15482, 1: 23921, 2: 42416, 3: 26992, 4: 27098, 5: 28205, 6: 27747,
}
const dowSum = Object.values(dowWeights).reduce((s, v) => s + v, 0)

function distributeAcrossDates(total: number, dates: string[]): number[] {
  const weights = dates.map((d) => {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay()
    return dowWeights[dow] / dowSum
  })
  const wsum = weights.reduce((s, w) => s + w, 0)
  const raw = weights.map((w) => (total * w) / wsum)
  const rounded = raw.map((v) => Math.round(v))
  const diff = total - rounded.reduce((s, v) => s + v, 0)
  rounded[rounded.length - 1] += diff
  return rounded
}

// MT-local time buckets (3-hour) from raw UTC hour counts.
// UTC → MT (UTC-7) mapping pre-computed:
//   12AM–3AM (MT 0,1,2)   ← UTC 7,8,9
//   3AM–6AM  (MT 3,4,5)   ← UTC 10,11,12
//   6AM–9AM  (MT 6,7,8)   ← UTC 13,14,15
//   9AM–12PM (MT 9,10,11) ← UTC 16,17,18
//   12PM–3PM (MT 12,13,14)← UTC 19,20,21
//   3PM–6PM  (MT 15,16,17)← UTC 22,23,0
//   6PM–9PM  (MT 18,19,20)← UTC 1,2,3
//   9PM–12AM (MT 21,22,23)← UTC 4,5,6
const MT_BUCKET_SHARES: Record<TimeBucket, number> = {
  '12AM–3AM': 12674 / 191861,
  '3AM–6AM':  10735 / 191861,
  '6AM–9AM':   1725 / 191861,
  '9AM–12PM':   811 / 191861,
  '12PM–3PM': 20003 / 191861,
  '3PM–6PM':  58647 / 191861,
  '6PM–9PM':  52099 / 191861,
  '9PM–12AM': 35167 / 191861,
}

const HEATMAP_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEATMAP_BUCKETS: TimeBucket[] = [
  '12AM–3AM', '3AM–6AM', '6AM–9AM', '9AM–12PM',
  '12PM–3PM', '3PM–6PM', '6PM–9PM', '9PM–12AM',
]

const DAY_TO_DOW: Record<DayOfWeek, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

function buildHeatmap(totalCalls: number) {
  // Per-conversation count distributed across day × time-of-day (assumed
  // approximately independent). Conversations roughly = messages / avg-turns.
  const cells: DemandHeatmapCell[] = []
  let peak: DemandHeatmapCell | undefined
  let workingHours = 0
  for (const day of HEATMAP_DAYS) {
    const dow = DAY_TO_DOW[day]
    const dayShare = dowWeights[dow] / dowSum
    for (const bucket of HEATMAP_BUCKETS) {
      const share = dayShare * MT_BUCKET_SHARES[bucket]
      const v = Math.round(totalCalls * share)
      const userMessages = Math.round(v * AVG_MSGS_PER_ENGAGED * 0.52)
      const cell: DemandHeatmapCell = {
        dayOfWeek: day,
        timeBucket: bucket,
        conversations: v,
        userMessages,
        // Voice has effectively no human-agent escalation in this export
        failedConversations: 0,
        supportTouchedConversations: 0,
      }
      cells.push(cell)
      if (!peak || cell.conversations > peak.conversations) peak = cell
      const weekend = day === 'Sat' || day === 'Sun'
      if (!weekend && (bucket === '9AM–12PM' || bucket === '12PM–3PM' || bucket === '3PM–6PM')) {
        workingHours += v
      }
    }
  }
  return {
    cells,
    peakCell: peak,
    afterHoursConversations: totalCalls - workingHours,
    afterHoursShare: (totalCalls - workingHours) / Math.max(1, totalCalls),
    workingHoursConversations: workingHours,
  }
}

// Top intents — pulled directly from the export's knowledge_search_query
// totals (occurrences across all messages). We scale by period.
const baselineIntents: Array<{ name: string; count: number }> = [
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

const baselineQuestions: Array<{ q: string; occ: number; lastSeen: string }> = [
  { q: 'How do I redeem a Friends & Family ticket at Snowbird?', occ: 1279, lastSeen: '2026-04-30T22:15:00Z' },
  { q: 'How do I check the exact name on my Mountain Collective account?', occ: 567, lastSeen: '2026-04-29T19:08:00Z' },
  { q: 'My cart shows "bundle requirements not met" at checkout.', occ: 564, lastSeen: '2026-04-30T17:42:00Z' },
  { q: 'Why am I seeing multiple order numbers in my account?', occ: 543, lastSeen: '2026-04-30T21:01:00Z' },
  { q: 'Where do I find my Purchaser ID for the renewal code?', occ: 463, lastSeen: '2026-04-30T16:33:00Z' },
  { q: 'My customer ID didn’t pass validation for Snowmass.', occ: 392, lastSeen: '2026-04-30T13:55:00Z' },
  { q: 'I got an empty-cart error when paying.', occ: 392, lastSeen: '2026-04-30T18:14:00Z' },
  { q: 'Where do I enter my referral code during purchase?', occ: 329, lastSeen: '2026-04-29T20:01:00Z' },
]

export function buildVoiceFixtures(period: VoicePeriodKey): VoiceFixtures {
  const daysInWindow =
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : TOTAL_DAYS
  const scale = daysInWindow / TOTAL_DAYS

  const totalCalls = Math.round(TOTAL_CALLS * scale)
  const resolvedCalls = Math.round(TOTAL_SOLVED * scale)
  const unengagedCalls = totalCalls - resolvedCalls
  const resolutionRate = totalCalls > 0 ? resolvedCalls / totalCalls : 0
  const dates = generateDates(daysInWindow)

  // ── Resolution stats (rate stable across period) ───────────────────
  const trend = dates.map((date, i) => ({
    date,
    rate: Math.max(0.55, Math.min(0.78, 0.665 + (((i * 23) % 11) / 11 - 0.5) * 0.06)),
  }))
  const resolution: ResolutionStats = {
    resolved: resolvedCalls,
    total: totalCalls,
    rate: resolutionRate,
    ratePrevious: resolutionRate - 0.018,
    trend,
  }

  const engagement = {
    totalCalls,
    resolvedCalls,
    unengagedCalls,
    resolutionRate,
    humanHandoffs: Math.round(2 * scale), // ~0 — the killer deflection stat
    handoffRate: (2 * scale) / Math.max(1, totalCalls),
  }

  // ── KPIs ───────────────────────────────────────────────────────────
  const kpis: KpiTileData[] = [
    {
      label: 'Total calls',
      value: totalCalls.toLocaleString(),
      caption: 'inbound voice conversations',
      delta: period === '7d' ? '+6.4%' : period === '30d' ? '+9.1%' : '+12.7%',
      deltaTone: 'positive',
      accent: 'none',
    },
    {
      label: 'AI-resolved calls',
      value: resolvedCalls.toLocaleString(),
      caption: `${(resolutionRate * 100).toFixed(1)}% of all calls`,
      delta: '+1.8 pts',
      deltaTone: 'positive',
      accent: 'success',
    },
    {
      label: 'Caller drop-off',
      value: unengagedCalls.toLocaleString(),
      caption: 'callers who didn’t fully engage',
      delta: '−2.1 pts',
      deltaTone: 'positive',
      accent: 'summit',
    },
    {
      label: 'Live-agent handoffs',
      value: engagement.humanHandoffs.toLocaleString(),
      caption: '~0% of calls — AI absorbed it all',
      delta: '0.0%',
      deltaTone: 'neutral',
      accent: 'glacier',
    },
  ]

  // ── Outcome timeline (no FAILED for voice) ─────────────────────────
  const totalsByDay = distributeAcrossDates(totalCalls, dates)
  const solvedByDay = distributeAcrossDates(resolvedCalls, dates)
  const data = dates.map((date, i) => {
    const tot = totalsByDay[i]
    const sol = solvedByDay[i]
    const un = Math.max(0, tot - sol)
    return {
      date,
      totalConversations: tot,
      solved: sol,
      unengaged: un,
      failed: 0,
      engagedConversations: sol,
      engagementRate: tot > 0 ? sol / tot : 0,
      resolutionRateOfEngaged: 1, // voice: all engaged = solved by definition here
    }
  })
  const outcomeTimeline: OutcomeTimelineProps = {
    data,
    totals: {
      totalConversations: totalCalls,
      solved: resolvedCalls,
      unengaged: unengagedCalls,
      failed: 0,
      engagementRate: resolutionRate, // for voice we surface the AI-resolution rate here
      resolutionRateOfEngaged: 1,
      engagementRateDelta: 0.018,
      failedDelta: 0,
    },
  }

  // ── Intents (scaled) ───────────────────────────────────────────────
  const totalIntentMessages = baselineIntents.reduce((s, i) => s + i.count, 0)
  const topIntents: KnowledgeSourceItem[] = baselineIntents.map((i, idx) => {
    const scaled = Math.round(i.count * scale)
    return {
      sourceName: i.name,
      botMessageCount: scaled,
      shareOfSourcedMessages: scaled / Math.max(1, totalIntentMessages * scale),
      shareOfAllBotMessages: scaled / Math.max(1, TOTAL_BOT_MSGS * scale),
      delta: [0.06, 0.02, 0.04, 0.018, -0.005, -0.012, 0.001, 0.022, 0.015, -0.009, 0.011, 0.025, 0.007][idx],
    }
  })

  const topQuestions: KnowledgeGap[] = baselineQuestions.map((q) => ({
    question: q.q,
    occurrences: Math.round(q.occ * scale),
    lastSeen: q.lastSeen,
  }))

  // ── Sender mix ─────────────────────────────────────────────────────
  const botMsgs = Math.round(TOTAL_BOT_MSGS * scale)
  const userMsgs = Math.round(TOTAL_USER_MSGS * scale)
  const supportMsgs = Math.round(TOTAL_SUPPORT_MSGS * scale)
  const totalMsgsScaled = botMsgs + userMsgs + supportMsgs
  const senderByDay = dates.map((date, i) => {
    const tot = totalsByDay[i]
    const turns = tot * AVG_MSGS_PER_ENGAGED * 0.5
    return {
      date,
      botMessages: Math.round(turns * (TOTAL_BOT_MSGS / TOTAL_MSGS)),
      userMessages: Math.round(turns * (TOTAL_USER_MSGS / TOTAL_MSGS)),
      supportMessages: Math.round(turns * (TOTAL_SUPPORT_MSGS / TOTAL_MSGS)),
      totalMessages: 0,
    }
  }).map((d) => ({ ...d, totalMessages: d.botMessages + d.userMessages + d.supportMessages }))
  const senderMix: SenderMixStackProps = {
    totals: {
      botMessages: botMsgs,
      userMessages: userMsgs,
      supportMessages: supportMsgs,
      totalMessages: totalMsgsScaled,
      botMessageShare: botMsgs / Math.max(1, totalMsgsScaled),
      supportMessageShare: supportMsgs / Math.max(1, totalMsgsScaled),
      avgMessagesPerEngagedConversation:
        resolvedCalls > 0 ? totalMsgsScaled / resolvedCalls : 0,
    },
    data: senderByDay,
  }

  // ── Demand heatmap (MT-local buckets) ──────────────────────────────
  const demandHeatmap: DemandHeatmapProps = buildHeatmap(totalCalls)

  // ── Geography ──────────────────────────────────────────────────────
  const knownGeo = 16642 + 3833 + 39 + 10 + 6 + 5 + 5 + 4 + 3 + 2 + 2 + 1
  const geography = [
    { country: 'United States', code: 'US', raw: 16642 },
    { country: 'Canada', code: 'CA', raw: 3833 },
    { country: 'Australia', code: 'AU', raw: 39 },
    { country: 'New Zealand', code: 'NZ', raw: 10 },
    { country: 'Mexico', code: 'MX', raw: 5 },
    { country: 'United Kingdom', code: 'GB', raw: 4 },
    { country: 'Germany', code: 'DE', raw: 2 },
    { country: 'Other', code: 'OTHER', raw: knownGeo - (16642 + 3833 + 39 + 10 + 5 + 4 + 2) },
  ].map((g) => ({
    country: g.country,
    conversations: Math.round(g.raw * scale),
    share: g.raw / knownGeo,
  }))

  // ── Call-time metrics (real, from message timestamps) ─────────────
  // Anchored to the full-period analysis; totals scale linearly, ratios
  // and medians are scale-invariant.
  const TOTAL_TALK_SECONDS = 1429646
  const TOTAL_AI_SECONDS = 1429571
  const TOTAL_HUMAN_SECONDS = 75
  const callTime: CallTimeMetrics = {
    totalCalls,
    under30sCount: Math.round(12677 * scale),
    under30sShare: 12677 / TOTAL_CALLS, // 61.6%
    over2minCount: Math.round(2651 * scale),
    over2minShare: 2651 / TOTAL_CALLS, // 12.9%
    over5minCount: Math.round(937 * scale),
    over5minShare: 937 / TOTAL_CALLS, // 4.6%
    longestCallSeconds: 3476, // 58 minutes — constant across periods
    totalTalkSeconds: Math.round(TOTAL_TALK_SECONDS * scale),
    totalTalkHours: +(TOTAL_TALK_SECONDS * scale / 3600).toFixed(1),
    avgTalkSeconds: 69.5,
    medianTalkSeconds: 14,
    totalAiSeconds: Math.round(TOTAL_AI_SECONDS * scale),
    totalAiHours: +(TOTAL_AI_SECONDS * scale / 3600).toFixed(1),
    avgAiSeconds: 69.5,
    medianAiSeconds: 14,
    totalHumanSeconds: Math.round(TOTAL_HUMAN_SECONDS * scale),
    avgHumanSecondsPerHumanCall: 75,
    medianHumanSecondsPerHumanCall: 75,
    aiOnlyCalls: Math.round(20581 * scale),
    humanInvolvedCalls: Math.max(0, Math.round(1 * scale)),
    humanHandoffRate: 1 / TOTAL_CALLS, // 0.005%
    aiTalkShare: TOTAL_AI_SECONDS / TOTAL_TALK_SECONDS,
    humanTalkShare: TOTAL_HUMAN_SECONDS / TOTAL_TALK_SECONDS,
  }

  const periodLabel =
    period === '7d'   ? 'Last 7 days · vs. prior 7' :
    period === '30d'  ? 'Last 30 days · vs. prior 30' :
    period === '90d'  ? 'Last 90 days · vs. prior 90' :
                        'All time (Jul 2025 → May 2026)'

  return {
    period,
    periodLabel,
    daysInWindow,
    resolution,
    engagement,
    kpis,
    outcomeTimeline,
    topIntents,
    intentTotalCalls: baselineIntents.reduce((s, i) => s + Math.round(i.count * scale), 0),
    topQuestions,
    senderMix,
    demandHeatmap,
    geography,
    callTime,
  }
}
