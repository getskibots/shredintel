/**
 * Realistic fixtures shaped from the Jackson Hole 100k-row chat export.
 * Numbers are derived from actual counts; rates are aspirational for the
 * trend deltas (period-over-period comparisons in the export aren't computed).
 */

import type {
  ActiveUsersPoint,
  ConversationCoverage,
  ConversationCountsProps,
  ConversionPulseProps,
  DayOfWeek,
  DemandHeatmapCell,
  DemandHeatmapProps,
  DeviceExperienceMixProps,
  FrictionPage,
  FunnelRow,
  GuestIdentitySplitProps,
  GuestLocationsProps,
  HourBucket,
  IntentBreakdown,
  KnowledgeGap,
  KnowledgeSourceLeaderboardProps,
  KnowledgeLayersProps,
  KnowledgeSectionDemandProps,
  ConversionBlockersProps,
  GuestSentimentProps,
  HumanHandoverProps,
  KpiTileData,
  LeadCaptureFunnelProps,
  OutcomeTimelineProps,
  RatingsSummary,
  ResolutionStats,
  SenderMixStackProps,
  TimeBucket,
} from '../types/analytics'

// ── Hero: resolution rate ────────────────────────────────────────────────
// From Jackson Hole export (bot_id=43), 23,076 unique conversations:
//   SOLVED: 4,099 (17.8%)
//   UNENGAGED: 18,789 (81.4%)
//   FAILED: 188 (0.8%)
// Engaged = SOLVED + FAILED = 4,287
// Resolution rate (of engaged) = 4,099 / 4,287 = 95.6%
// We hero this rate because it isolates bot performance from the separate
// (and much bigger) engagement problem.

export const sampleResolution: ResolutionStats = {
  resolved: 4099,
  total: 4287,
  rate: 0.956,
  ratePrevious: 0.931,
  trend: [
    { date: '2026-05-13', rate: 0.94 },
    { date: '2026-05-14', rate: 0.95 },
    { date: '2026-05-15', rate: 0.93 },
    { date: '2026-05-16', rate: 0.96 },
    { date: '2026-05-17', rate: 0.97 },
    { date: '2026-05-18', rate: 0.95 },
    { date: '2026-05-19', rate: 0.96 },
  ],
}

export interface EngagementSummary {
  totalConversations: number
  engagedConversations: number
  engagementRate: number
  unengaged: number
}

export const sampleEngagement: EngagementSummary = {
  totalConversations: 23076,
  engagedConversations: 4287,
  engagementRate: 4287 / 23076,
  unengaged: 18789,
}

// ── KPI strip — four supporting metrics ──────────────────────────────────

export const sampleKpis: KpiTileData[] = [
  {
    label: 'Total conversations',
    value: '23,076',
    caption: 'guests the bot greeted',
    delta: '+8.2%',
    deltaTone: 'positive',
    accent: 'none',
  },
  {
    label: 'Engagement rate',
    value: '18.6%',
    caption: '4,287 guests replied to the bot',
    delta: '+1.4 pts',
    deltaTone: 'positive',
    accent: 'summit',
  },
  {
    label: 'Bot-attributed conversions',
    value: '870',
    caption: '20% of engaged chats → purchase',
    delta: '+9.7%',
    deltaTone: 'positive',
    accent: 'success',
  },
  {
    label: 'Knowledge-gap rate',
    value: '62%',
    caption: 'bot answers with no KB source',
    delta: '−4 pts',
    deltaTone: 'positive',
    accent: 'danger',
  },
]

// ── Friction map: pages driving chat volume ──────────────────────────────
// Top 20 page paths from the JH export, ranked by chat volume.
// Checkout-flow pages are flagged — these are conversion-critical surfaces.

export const sampleFrictionPages: FrictionPage[] = [
  { path: '/best-spring-break-ever', conversations: 10539, isCheckoutFlow: false },
  { path: '/', conversations: 8935, isCheckoutFlow: false },
  { path: '/live-mountain-cams', conversations: 8244, isCheckoutFlow: false },
  { path: 'shop/onepagecheckout', conversations: 7522, isCheckoutFlow: true },
  { path: 'shop/lift-tickets', conversations: 5621, isCheckoutFlow: true },
  { path: '/mountain-report', conversations: 4654, isCheckoutFlow: false },
  { path: 'shop/order/history', conversations: 3221, isCheckoutFlow: true },
  { path: '/kings-queens-corbets', conversations: 2802, isCheckoutFlow: false },
  { path: 'shop/lift-tickets-rentals', conversations: 2553, isCheckoutFlow: true },
  { path: 'shop/ordercomplete', conversations: 2343, isCheckoutFlow: true },
  { path: 'shop/cart', conversations: 2144, isCheckoutFlow: true },
  { path: '/maps/mountain-winter', conversations: 1853, isCheckoutFlow: false },
  { path: '/lift-tickets', conversations: 1613, isCheckoutFlow: false },
  { path: 'shop/customer/info', conversations: 1561, isCheckoutFlow: true },
  { path: '/season-pass', conversations: 1178, isCheckoutFlow: false },
]

// ── Knowledge gaps: top "no-source" question themes ──────────────────────
// Derived from `knowledge_top_source` being empty alongside frequent
// `last_user_message` themes in the export.

export const sampleKnowledgeGaps: KnowledgeGap[] = [
  {
    question: 'Can I get a refund on my Mountain Collective reservation?',
    occurrences: 412,
    lastSeen: '2026-05-19T18:42:00Z',
  },
  {
    question: "Why can't I complete my waiver signature?",
    occurrences: 287,
    lastSeen: '2026-05-19T16:08:00Z',
  },
  {
    question: 'When can Ikon pass holders reserve day use?',
    occurrences: 244,
    lastSeen: '2026-05-19T22:31:00Z',
  },
  {
    question: 'Tram frequency and typical wait times?',
    occurrences: 198,
    lastSeen: '2026-05-19T14:55:00Z',
  },
  {
    question: 'Can I cancel today’s reservation due to weather?',
    occurrences: 156,
    lastSeen: '2026-05-19T11:12:00Z',
  },
  {
    question: 'Help processing payment for lift tickets',
    occurrences: 142,
    lastSeen: '2026-05-19T19:24:00Z',
  },
  {
    question: 'How to add a friends-and-family redemption code?',
    occurrences: 118,
    lastSeen: '2026-05-19T15:47:00Z',
  },
]

// ── v1 parity (preserved for migration / Storybook stories) ──────────────

export const sampleActiveUsers: ActiveUsersPoint[] = [
  { date: '2026-05-13', activeUsers: 3187, newUsers: 2241 },
  { date: '2026-05-14', activeUsers: 3460, newUsers: 2398 },
  { date: '2026-05-15', activeUsers: 2941, newUsers: 1985 },
  { date: '2026-05-16', activeUsers: 3812, newUsers: 2611 },
  { date: '2026-05-17', activeUsers: 4203, newUsers: 2890 },
  { date: '2026-05-18', activeUsers: 4129, newUsers: 2740 },
  { date: '2026-05-19', activeUsers: 3344, newUsers: 2104 },
]

export const sampleCoverage: ConversationCoverage = {
  byAgent: 99.5,
  byCustomerSupport: 0.5,
}

export const sampleHourBuckets: HourBucket[] = (() => {
  const out: HourBucket[] = []
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const peak = h >= 10 && h <= 16 ? 1 : 0.3
      out.push({
        dayOfWeek: d as HourBucket['dayOfWeek'],
        hour: h,
        conversations: Math.round(Math.random() * 10 * peak),
      })
    }
  }
  return out
})()

export const sampleRatings: RatingsSummary = {
  averageRating: 0,
  totalRatings: 0,
  reviews: [],
}

export const sampleFunnels: FunnelRow[] = [
  {
    id: 'welcome',
    name: 'Welcome Message',
    steps: 2,
    totalConversations: 93,
    completionRate: 0,
  },
]

export const sampleIntents: IntentBreakdown[] = [
  { intent: 'Lift ticket pricing', total: 312, unresolved: 78, unresolvedRate: 0.25 },
  { intent: 'Parking & shuttle', total: 198, unresolved: 64, unresolvedRate: 0.32 },
  { intent: 'Snow & trail report', total: 241, unresolved: 47, unresolvedRate: 0.20 },
  { intent: 'Lessons & rentals', total: 156, unresolved: 38, unresolvedRate: 0.24 },
  { intent: 'Lodging recommendations', total: 89, unresolved: 31, unresolvedRate: 0.35 },
  { intent: 'Lost & found', total: 67, unresolved: 22, unresolvedRate: 0.33 },
]

// ─────────────────────────────────────────────────────────────────────────
// New 8-component fixtures (Brief: GPT instructions for shredintel reports)
// All numbers anchored to the Jackson Hole export (bot_id=43).
// Daily series spread the period totals across 7 days with realistic noise.
// ─────────────────────────────────────────────────────────────────────────

const DATES_7D = [
  '2026-05-13',
  '2026-05-14',
  '2026-05-15',
  '2026-05-16',
  '2026-05-17',
  '2026-05-18',
  '2026-05-19',
] as const

// Outcome distribution per day (sums roughly to period totals)
const dailyOutcome = [
  { date: DATES_7D[0], total: 2980, solved: 510, failed: 22, unengaged: 2448 },
  { date: DATES_7D[1], total: 3286, solved: 612, failed: 28, unengaged: 2646 },
  { date: DATES_7D[2], total: 3015, solved: 540, failed: 24, unengaged: 2451 },
  { date: DATES_7D[3], total: 3447, solved: 632, failed: 31, unengaged: 2784 },
  { date: DATES_7D[4], total: 3601, solved: 685, failed: 30, unengaged: 2886 },
  { date: DATES_7D[5], total: 3502, solved: 660, failed: 28, unengaged: 2814 },
  { date: DATES_7D[6], total: 3245, solved: 460, failed: 25, unengaged: 2760 },
]

export const outcomeTimelineSample: OutcomeTimelineProps = {
  data: dailyOutcome.map((d) => {
    const engaged = d.solved + d.failed
    return {
      date: d.date,
      totalConversations: d.total,
      solved: d.solved,
      unengaged: d.unengaged,
      failed: d.failed,
      engagedConversations: engaged,
      engagementRate: engaged / d.total,
      resolutionRateOfEngaged: engaged > 0 ? d.solved / engaged : 0,
    }
  }),
  totals: {
    totalConversations: 23076,
    solved: 4099,
    unengaged: 18789,
    failed: 188,
    engagementRate: 0.186,
    resolutionRateOfEngaged: 0.956,
    engagementRateDelta: 0.014,
    failedDelta: -0.008,
  },
}

export const conversionPulseSample: ConversionPulseProps = {
  totalConverted: 870,
  conversionShareOfTotal: 870 / 23076,
  conversionShareOfEngaged: 870 / 4287,
  convertedDelta: 0.097,
  bestDay: { date: '2026-05-18', convertedConversations: 158 },
  timeline: [
    { date: DATES_7D[0], convertedConversations: 102, totalConversations: 2980, engagedConversations: 532, conversionShareOfTotal: 0.034, conversionShareOfEngaged: 0.192 },
    { date: DATES_7D[1], convertedConversations: 128, totalConversations: 3286, engagedConversations: 640, conversionShareOfTotal: 0.039, conversionShareOfEngaged: 0.200 },
    { date: DATES_7D[2], convertedConversations: 111, totalConversations: 3015, engagedConversations: 564, conversionShareOfTotal: 0.037, conversionShareOfEngaged: 0.197 },
    { date: DATES_7D[3], convertedConversations: 134, totalConversations: 3447, engagedConversations: 663, conversionShareOfTotal: 0.039, conversionShareOfEngaged: 0.202 },
    { date: DATES_7D[4], convertedConversations: 138, totalConversations: 3601, engagedConversations: 715, conversionShareOfTotal: 0.038, conversionShareOfEngaged: 0.193 },
    { date: DATES_7D[5], convertedConversations: 158, totalConversations: 3502, engagedConversations: 688, conversionShareOfTotal: 0.045, conversionShareOfEngaged: 0.230 },
    { date: DATES_7D[6], convertedConversations: 99, totalConversations: 3245, engagedConversations: 485, conversionShareOfTotal: 0.031, conversionShareOfEngaged: 0.204 },
  ],
}

// Knowledge source leaderboard
const sourcedBot = 17727
const unsourcedBot = 29095
const sourceCounts = [
  { sourceName: 'Lift Tickets FAQ', count: 4128 },
  { sourceName: 'Mountain Report', count: 3210 },
  { sourceName: 'Season Pass Help', count: 2876 },
  { sourceName: 'Activities & Tram Info', count: 2415 },
  { sourceName: 'Refund Policy', count: 1980 },
  { sourceName: 'Parking & Arrival Info', count: 1632 },
  { sourceName: 'Mountain Sports School', count: 1486 },
]

export const knowledgeSourceLeaderboardSample: KnowledgeSourceLeaderboardProps = {
  sourcedBotMessages: sourcedBot,
  unsourcedBotMessages: unsourcedBot,
  knowledgeGapRate: unsourcedBot / (sourcedBot + unsourcedBot),
  topSources: sourceCounts.map((s, i) => ({
    sourceName: s.sourceName,
    botMessageCount: s.count,
    shareOfSourcedMessages: s.count / sourcedBot,
    shareOfAllBotMessages: s.count / (sourcedBot + unsourcedBot),
    delta: [0.04, 0.02, 0.018, -0.005, -0.012, 0.001, 0.022][i],
  })),
}

// Sender mix — roughly 47k BOT / 60k USER / 125 SUPPORT messages from the export
const senderTotals = { bot: 46822, user: 59620, support: 125 }
const senderDaily = DATES_7D.map((date, i) => {
  const scale = [0.13, 0.15, 0.13, 0.16, 0.17, 0.15, 0.11][i]
  return {
    date,
    botMessages: Math.round(senderTotals.bot * scale),
    userMessages: Math.round(senderTotals.user * scale),
    supportMessages: Math.round(senderTotals.support * scale),
    totalMessages: 0,
  }
}).map((d) => ({ ...d, totalMessages: d.botMessages + d.userMessages + d.supportMessages }))

const totalMessages = senderTotals.bot + senderTotals.user + senderTotals.support

export const senderMixStackSample: SenderMixStackProps = {
  totals: {
    botMessages: senderTotals.bot,
    userMessages: senderTotals.user,
    supportMessages: senderTotals.support,
    totalMessages,
    botMessageShare: senderTotals.bot / totalMessages,
    supportMessageShare: senderTotals.support / totalMessages,
    avgMessagesPerEngagedConversation: totalMessages / 4287,
  },
  data: senderDaily,
}

// Guest identity (aggregate only — no PII)
export const guestIdentitySplitSample: GuestIdentitySplitProps = {
  totalConversations: 23076,
  knownGuests: 6800,
  anonymousGuests: 16276,
  contactableGuests: 1400,
  knownGuestRate: 6800 / 23076,
  contactableGuestRate: 1400 / 23076,
  knownGuestRateDelta: 0.021,
  contactableGuestRateDelta: 0.008,
}

// Lead capture funnel
const lcfStart = 23076
const lcfSteps = [
  { label: 'Conversation started', count: 23076 },
  { label: 'Guest engaged', count: 4287 },
  { label: 'Identity known', count: 6800 },
  { label: 'Contact captured', count: 1400 },
  { label: 'Support touched', count: 250 },
]
export const leadCaptureFunnelSample: LeadCaptureFunnelProps = {
  steps: lcfSteps.map((s, i, arr) => ({
    label: s.label,
    count: s.count,
    shareOfStarted: s.count / lcfStart,
    shareOfPreviousStep: i === 0 ? undefined : s.count / arr[i - 1].count,
  })),
  engagementRate: 4287 / 23076,
  contactCaptureRate: 1400 / 23076,
  supportTouchedRate: 250 / 23076,
}

// Device experience mix
const knownDeviceTotal = 15082 + 7636 + 287
export const deviceExperienceMixSample: DeviceExperienceMixProps = {
  devices: [
    {
      deviceCategory: 'MOBILE',
      conversations: 15082,
      share: 15082 / knownDeviceTotal,
      failedConversations: 121,
      failedRate: 0.008,
    },
    {
      deviceCategory: 'DESKTOP',
      conversations: 7636,
      share: 7636 / knownDeviceTotal,
      failedConversations: 58,
      failedRate: 0.0076,
    },
    {
      deviceCategory: 'TABLET',
      conversations: 287,
      share: 287 / knownDeviceTotal,
      failedConversations: 4,
      failedRate: 0.014,
    },
  ],
  browsers: [
    { browser: 'Safari', conversations: 11150, share: 0.484 },
    { browser: 'Chrome', conversations: 11400, share: 0.495 },
    { browser: 'Firefox', conversations: 307, share: 0.013 },
    { browser: 'Edge', conversations: 142, share: 0.006 },
    { browser: 'Samsung', conversations: 41, share: 0.002 },
    { browser: 'Other', conversations: 36, share: 0.0015 },
  ],
  mobileShare: 15082 / knownDeviceTotal,
  desktopShare: 7636 / knownDeviceTotal,
  tabletShare: 287 / knownDeviceTotal,
  mobileShareDelta: 0.018,
}

// Demand heatmap — 7 × 8 cells
const HEATMAP_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEATMAP_BUCKETS: TimeBucket[] = [
  '12AM–3AM',
  '3AM–6AM',
  '6AM–9AM',
  '9AM–12PM',
  '12PM–3PM',
  '3PM–6PM',
  '6PM–9PM',
  '9PM–12AM',
]

// Plausible intensity by bucket (roughly mountain-time guest behavior).
// 9AM–3PM is heavy, evenings moderate, late night low.
const bucketBase: Record<TimeBucket, number> = {
  '12AM–3AM': 0.04,
  '3AM–6AM': 0.03,
  '6AM–9AM': 0.10,
  '9AM–12PM': 0.22,
  '12PM–3PM': 0.24,
  '3PM–6PM': 0.16,
  '6PM–9PM': 0.13,
  '9PM–12AM': 0.08,
}
// Day weight — weekends and Friday slightly heavier
const dayWeight: Record<DayOfWeek, number> = {
  Mon: 0.95,
  Tue: 0.92,
  Wed: 1.00,
  Thu: 1.04,
  Fri: 1.10,
  Sat: 1.18,
  Sun: 1.10,
}
const TOTAL_HEATMAP = 23076
const dayWeightSum = HEATMAP_DAYS.reduce((s, d) => s + dayWeight[d], 0)

const heatmapCells: DemandHeatmapCell[] = []
let peakCell: DemandHeatmapCell | undefined

for (const day of HEATMAP_DAYS) {
  const dayShare = dayWeight[day] / dayWeightSum
  const dayTotal = TOTAL_HEATMAP * dayShare
  for (const bucket of HEATMAP_BUCKETS) {
    const v = Math.round(dayTotal * bucketBase[bucket])
    const userMessages = Math.round(v * 0.85)
    const failedConversations = Math.round(v * 0.008)
    const supportTouchedConversations = Math.round(v * 0.01)
    const cell: DemandHeatmapCell = {
      dayOfWeek: day,
      timeBucket: bucket,
      conversations: v,
      userMessages,
      failedConversations,
      supportTouchedConversations,
    }
    heatmapCells.push(cell)
    if (!peakCell || cell.conversations > peakCell.conversations) peakCell = cell
  }
}

function isWorkingBucketLocal(day: DayOfWeek, bucket: TimeBucket): boolean {
  if (day === 'Sat' || day === 'Sun') return false
  return bucket === '9AM–12PM' || bucket === '12PM–3PM' || bucket === '3PM–6PM'
}
let workingHours = 0
for (const c of heatmapCells) {
  if (isWorkingBucketLocal(c.dayOfWeek, c.timeBucket)) workingHours += c.conversations
}
const afterHours = TOTAL_HEATMAP - workingHours

export const demandHeatmapSample: DemandHeatmapProps = {
  cells: heatmapCells,
  peakCell,
  afterHoursConversations: afterHours,
  afterHoursShare: afterHours / TOTAL_HEATMAP,
  workingHoursConversations: workingHours,
}

// ─────────────────────────────────────────────────────────────────────────
// Period-aware fixture factory.
// `buildPeriodFixtures(key)` returns a bundle of props sized to the
// requested window. Presets ('7d' | '30d' | '90d' | 'all') scale off the
// JH 7-day baseline. For arbitrary date ranges use
// `buildPeriodFixturesForDays(days, label)`.
// Daily series respect a weekly pattern + slight growth across the period.
// ─────────────────────────────────────────────────────────────────────────

export type PeriodKey = '7d' | '30d' | '90d' | 'all'

export interface PeriodFixtures {
  period: PeriodKey
  periodLabel: string
  resolution: ResolutionStats
  engagement: EngagementSummary
  kpis: KpiTileData[]
  conversationCounts: ConversationCountsProps
  outcomeTimeline: OutcomeTimelineProps
  conversionPulse: ConversionPulseProps
  knowledgeSourceLeaderboard: KnowledgeSourceLeaderboardProps
  knowledgeLayers: KnowledgeLayersProps
  senderMixStack: SenderMixStackProps
  knowledgeSectionDemand: KnowledgeSectionDemandProps
  conversionBlockers: ConversionBlockersProps
  guestSentiment: GuestSentimentProps
  humanHandover: HumanHandoverProps
  guestIdentitySplit: GuestIdentitySplitProps
  leadCaptureFunnel: LeadCaptureFunnelProps
  frictionPages: FrictionPage[]
  knowledgeGaps: KnowledgeGap[]
  deviceExperienceMix: DeviceExperienceMixProps
  guestLocations: GuestLocationsProps
  demandHeatmap: DemandHeatmapProps
}

const END_DATE = '2026-05-19'

function generateDates(days: number, end = END_DATE): string[] {
  const endDate = new Date(end + 'T00:00:00Z')
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(endDate)
    d.setUTCDate(endDate.getUTCDate() - (days - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

const WEEKLY_CYCLE = [0.95, 0.92, 1.0, 1.04, 1.1, 1.18, 1.1] // Mon..Sun

function weightFor(dateStr: string, dayIndexInPeriod: number, periodLen: number): number {
  // Day-of-week cycle * mild growth across the period (later dates slightly higher)
  const dow = (new Date(dateStr + 'T00:00:00Z').getUTCDay() + 6) % 7 // 0 = Mon
  const cycle = WEEKLY_CYCLE[dow] ?? 1
  const growth = 0.92 + 0.16 * (dayIndexInPeriod / Math.max(1, periodLen - 1)) // 0.92→1.08
  return cycle * growth
}

function distributeAcrossDates(total: number, dates: string[]): number[] {
  const weights = dates.map((d, i) => weightFor(d, i, dates.length))
  const wsum = weights.reduce((s, w) => s + w, 0)
  // First pass: float values, then round and fix residual on last day
  const raw = weights.map((w) => (total * w) / wsum)
  const rounded = raw.map((v) => Math.round(v))
  const diff = total - rounded.reduce((s, v) => s + v, 0)
  rounded[rounded.length - 1] += diff
  return rounded
}

/** Days a preset represents (must match resolveSelection in src/lib/period.ts). */
function daysForPreset(period: PeriodKey): number {
  return period === '7d'  ? 7
       : period === '30d' ? 30
       : period === '90d' ? 90
       :                    730 // 'all' — arbitrary far-back window
}

/** Human label for a preset (matches PERIOD_LABELS in src/lib/period.ts). */
function labelForPreset(period: PeriodKey): string {
  return period === '7d'  ? 'Last 7 days · vs. prior 7'
       : period === '30d' ? 'Last 30 days · vs. prior 30'
       : period === '90d' ? 'Last 90 days · vs. prior 90'
       :                    'All time'
}

export function buildPeriodFixtures(period: PeriodKey): PeriodFixtures {
  return buildPeriodFixturesForDays(daysForPreset(period), labelForPreset(period), period)
}

/**
 * Days-driven fixture builder. Used by the picker for arbitrary custom
 * ranges. Callers pass the day count and a human label; the shape and
 * daily-series pattern are identical to `buildPeriodFixtures`.
 */
export function buildPeriodFixturesForDays(
  daysArg: number,
  label: string,
  periodTag: PeriodKey = '30d',
): PeriodFixtures {
  const days = Math.max(1, Math.min(daysArg, 730))
  const scale = days / 7
  const period: PeriodKey = periodTag
  const dates = generateDates(days)

  // Period totals (scaled from the JH 7-day baseline)
  const totalConversations = Math.round(23076 * scale)
  const solved = Math.round(4099 * scale)
  const unengaged = Math.round(18789 * scale)
  const failed = totalConversations - solved - unengaged // make it sum exactly
  const engaged = solved + failed
  const engagementRate = engaged / totalConversations
  const resolutionRateOfEngaged = engaged > 0 ? solved / engaged : 0
  const converted = Math.round(870 * scale)
  const sourcedBotMsgs = Math.round(17727 * scale)
  const unsourcedBotMsgs = Math.round(29095 * scale)
  const botMsgs = Math.round(46822 * scale)
  const userMsgs = Math.round(59620 * scale)
  const supportMsgs = Math.round(125 * scale)
  const totalMsgs = botMsgs + userMsgs + supportMsgs

  // ── Resolution stats (rate is quality, doesn't scale) ──────────────
  const resolutionTrend = dates.map((date, i) => {
    // Resolution rate hovers around 95.6% with small wobble
    const wobble = ((i * 37) % 17) / 17 - 0.5
    return { date, rate: Math.max(0.88, Math.min(0.99, 0.956 + wobble * 0.04)) }
  })
  const resolution: ResolutionStats = {
    resolved: solved,
    total: engaged,
    rate: resolutionRateOfEngaged,
    ratePrevious: resolutionRateOfEngaged - 0.025,
    trend: resolutionTrend,
  }

  const engagement: EngagementSummary = {
    totalConversations,
    engagedConversations: engaged,
    engagementRate,
    unengaged,
  }

  // ── KPI strip (engaged-only scope) ──────────────────────────────────
  const kpis: KpiTileData[] = [
    {
      label: 'Engaged conversations',
      value: engaged.toLocaleString(),
      caption: 'guests who replied to the bot',
      delta: period === '30d' ? '+9.6%' : '+5.4%',
      deltaTone: 'positive',
      accent: 'none',
    },
    {
      label: 'Resolved',
      value: solved.toLocaleString(),
      caption: `${((solved / engaged) * 100).toFixed(1)}% of engaged`,
      delta: period === '30d' ? '+11.2%' : '+7.8%',
      deltaTone: 'positive',
      accent: 'success',
    },
    {
      label: 'Bot-attributed conversions',
      value: converted.toLocaleString(),
      caption: `${((converted / engaged) * 100).toFixed(0)}% of engaged → purchase`,
      delta: period === '30d' ? '+14.3%' : '+9.7%',
      deltaTone: 'positive',
      accent: 'success',
    },
    {
      label: 'Knowledge-gap rate',
      value: '62%',
      caption: 'bot answers with no KB source',
      delta: '−4 pts',
      deltaTone: 'positive',
      accent: 'danger',
    },
  ]

  // ── Outcome timeline (engaged-only — drops UNENGAGED) ──────────────
  const solvedByDay = distributeAcrossDates(solved, dates)
  const failedByDay = distributeAcrossDates(failed, dates)
  const outcomeData = dates.map((date, i) => {
    const s = solvedByDay[i]
    const f = failedByDay[i]
    const eng = s + f
    return {
      date,
      totalConversations: eng, // scope is engaged-only
      solved: s,
      unengaged: 0,
      failed: f,
      engagedConversations: eng,
      engagementRate: 1,
      resolutionRateOfEngaged: eng > 0 ? s / eng : 0,
    }
  })
  const outcomeTimeline: OutcomeTimelineProps = {
    data: outcomeData,
    totals: {
      totalConversations: engaged,
      solved,
      unengaged: 0,
      failed,
      engagementRate: 1,
      resolutionRateOfEngaged,
      engagementRateDelta: undefined,
      failedDelta: -0.008,
    },
  }

  // ── Conversion pulse ───────────────────────────────────────────────
  const convertedByDay = distributeAcrossDates(converted, dates)
  let bestDayIdx = 0
  convertedByDay.forEach((v, i) => {
    if (v > convertedByDay[bestDayIdx]) bestDayIdx = i
  })
  const conversionPulse: ConversionPulseProps = {
    totalConverted: converted,
    conversionShareOfTotal: converted / totalConversations,
    conversionShareOfEngaged: converted / engaged,
    convertedDelta: period === '30d' ? 0.143 : 0.097,
    bestDay: {
      date: dates[bestDayIdx],
      convertedConversations: convertedByDay[bestDayIdx],
    },
    timeline: dates.map((date, i) => ({
      date,
      convertedConversations: convertedByDay[i],
      totalConversations: outcomeData[i].engagedConversations,
      engagedConversations: outcomeData[i].engagedConversations,
      conversionShareOfTotal:
        convertedByDay[i] / Math.max(1, outcomeData[i].engagedConversations),
      conversionShareOfEngaged:
        convertedByDay[i] / Math.max(1, outcomeData[i].engagedConversations),
    })),
  }

  // ── Knowledge source leaderboard (snapshot — scale by period) ──────
  const baselineSources = [
    { name: 'Lift Tickets FAQ', count: 4128 },
    { name: 'Mountain Report', count: 3210 },
    { name: 'Season Pass Help', count: 2876 },
    { name: 'Activities & Tram Info', count: 2415 },
    { name: 'Refund Policy', count: 1980 },
    { name: 'Parking & Arrival Info', count: 1632 },
    { name: 'Mountain Sports School', count: 1486 },
  ]
  const knowledgeSourceLeaderboard: KnowledgeSourceLeaderboardProps = {
    sourcedBotMessages: sourcedBotMsgs,
    unsourcedBotMessages: unsourcedBotMsgs,
    knowledgeGapRate: unsourcedBotMsgs / (sourcedBotMsgs + unsourcedBotMsgs),
    topSources: baselineSources.map((s, i) => {
      const scaled = Math.round(s.count * scale)
      return {
        sourceName: s.name,
        botMessageCount: scaled,
        shareOfSourcedMessages: scaled / sourcedBotMsgs,
        shareOfAllBotMessages: scaled / (sourcedBotMsgs + unsourcedBotMsgs),
        delta: [0.04, 0.02, 0.018, -0.005, -0.012, 0.001, 0.022][i],
      }
    }),
  }

  // ── Knowledge layers (where answers come from) ─────────────────────
  // Demo shape mirrors JH: Text Edits dominant, Website next, ~18% Instructions
  // (prompt-only), tiny Files, ~1% Failed. Grounding ≈ 81%.
  const kbTotal = sourcedBotMsgs + unsourcedBotMsgs
  const knowledgeLayers: KnowledgeLayersProps = {
    layers: [
      { layer: 'Text Edits', answers: Math.round(kbTotal * 0.548) },
      { layer: 'Website', answers: Math.round(kbTotal * 0.256) },
      { layer: 'Instructions', answers: Math.round(kbTotal * 0.18) },
      { layer: 'Failed', answers: Math.round(kbTotal * 0.011) },
      { layer: 'Files', answers: Math.round(kbTotal * 0.005) },
    ],
  }

  // ── Sender mix ──────────────────────────────────────────────────────
  const botByDay = distributeAcrossDates(botMsgs, dates)
  const userByDay = distributeAcrossDates(userMsgs, dates)
  const supportByDay = distributeAcrossDates(supportMsgs, dates)
  const senderMixStack: SenderMixStackProps = {
    totals: {
      botMessages: botMsgs,
      userMessages: userMsgs,
      supportMessages: supportMsgs,
      totalMessages: totalMsgs,
      botMessageShare: botMsgs / totalMsgs,
      supportMessageShare: supportMsgs / totalMsgs,
      avgMessagesPerEngagedConversation: totalMsgs / engaged,
    },
    data: dates.map((date, i) => ({
      date,
      botMessages: botByDay[i],
      userMessages: userByDay[i],
      supportMessages: supportByDay[i],
      totalMessages: botByDay[i] + userByDay[i] + supportByDay[i],
    })),
  }

  // ── Conversation counts (§1 Extended Conversation Counts) ──────────
  const sessionsByDay = distributeAcrossDates(totalConversations, dates)
  const msgsByDay = distributeAcrossDates(totalMsgs, dates)
  const singleUserMsgSessions = Math.round(engaged * 0.34)
  const conversationCounts: ConversationCountsProps = {
    users: Math.round(totalConversations * 0.72), // ~1.4 conversations per user
    substantive: Math.round(engaged * 0.9),
    sessions: totalConversations,
    messages: totalMsgs,
    userMessages: userMsgs,
    engagedSessions: engaged,
    singleUserMsgSessions,
    singleMsgShareOfEngaged: engaged > 0 ? singleUserMsgSessions / engaged : 0,
    messagesPerSession: totalConversations > 0 ? totalMsgs / totalConversations : 0,
    userMessagesPerSession: totalConversations > 0 ? userMsgs / totalConversations : 0,
    avgUserMsgsPerEngaged: engaged > 0 ? userMsgs / engaged : 0,
    avgFirstResponseSec: 3.4,
    medianFirstResponseSec: 2.1,
    sessionsDelta: period === '30d' ? 0.086 : 0.052,
    messagesDelta: period === '30d' ? 0.094 : 0.061,
    trend: dates.map((date, i) => ({
      date,
      sessions: sessionsByDay[i],
      engaged: Math.round(sessionsByDay[i] * (totalConversations > 0 ? engaged / totalConversations : 0.35)),
      messages: msgsByDay[i],
      userMessages: userByDay[i],
    })),
  }

  // ── ShredIntel enrichment panels (§2) ──────────────────────────────
  const totalSub = Math.round(21000 * scale)
  const sectionRaw: Array<[string, number]> = [
    ['General Info', 0.30], ['Tickets', 0.18], ['Ecommerce / Account Management', 0.09],
    ['Refund Policies', 0.07], ['Season Passes', 0.06], ['Parking & Transit', 0.05],
    ['Ski & Snowboard Lessons', 0.045], ['Lodging', 0.04], ['Dining & Après', 0.03],
    ['Ski & Snowboard Rentals', 0.028], ['Events', 0.02], ['Other', 0.037],
  ]
  const knowledgeSectionDemand: KnowledgeSectionDemandProps = {
    totalSubstantive: totalSub,
    sections: sectionRaw.map(([label, sh]) => ({ label, conversations: Math.round(totalSub * sh), share: sh })),
  }
  const pinchRaw: Array<[string, number]> = [
    ['Account access', 0.018], ['Login', 0.012], ['Checkout', 0.010], ['Password reset', 0.008],
    ['Payment', 0.007], ['Waiver', 0.006], ['Order lookup', 0.005], ['Booking change', 0.004],
    ['Confirmation', 0.003], ['Voucher', 0.002], ['Credit', 0.002],
  ]
  const affected = Math.round(totalSub * pinchRaw.reduce((s, [, x]) => s + x, 0))
  const conversionBlockers: ConversionBlockersProps = {
    affectedConversations: affected,
    affectedShare: totalSub > 0 ? affected / totalSub : 0,
    blockers: pinchRaw.map(([label, sh]) => ({
      label, conversations: Math.round(totalSub * sh), share: sh, negative: Math.round(totalSub * sh * 0.5),
    })),
  }
  const sNeg = Math.round(totalSub * 0.09)
  const sPos = Math.round(totalSub * 0.15)
  const guestSentiment: GuestSentimentProps = {
    positive: sPos, neutral: totalSub - sNeg - sPos, negative: sNeg, total: totalSub,
    positiveShare: totalSub > 0 ? sPos / totalSub : 0, negativeShare: totalSub > 0 ? sNeg / totalSub : 0,
  }

  // ── Human handover (demo mirrors real JH shape: ~31% need a human) ──
  const hvNo = Math.round(14216 * scale)
  const hvPossible = Math.round(4432 * scale)
  const hvClear = Math.round(2088 * scale) // Clear + the rare "Escalation Required"
  const hvTotal = hvNo + hvPossible + hvClear
  const hvEscalated = Math.round(205 * scale)
  const humanHandover: HumanHandoverProps = {
    segments: [
      { label: 'Handled by bot', conversations: hvNo, share: hvTotal > 0 ? hvNo / hvTotal : 0 },
      { label: 'Possible handover', conversations: hvPossible, share: hvTotal > 0 ? hvPossible / hvTotal : 0 },
      { label: 'Clear handover', conversations: hvClear, share: hvTotal > 0 ? hvClear / hvTotal : 0 },
    ],
    totalSubstantive: hvTotal,
    neededHuman: hvPossible + hvClear,
    neededHumanShare: hvTotal > 0 ? (hvPossible + hvClear) / hvTotal : 0,
    clearHandover: hvClear,
    escalated: hvEscalated,
    gap: Math.max(0, hvClear - hvEscalated),
  }

  // ── Guest identity (aggregate counts only) ─────────────────────────
  const known = Math.round(6800 * scale)
  const anon = totalConversations - known
  const contactable = Math.round(1400 * scale)
  const guestIdentitySplit: GuestIdentitySplitProps = {
    totalConversations,
    knownGuests: known,
    anonymousGuests: anon,
    contactableGuests: contactable,
    knownGuestRate: known / totalConversations,
    contactableGuestRate: contactable / totalConversations,
    knownGuestRateDelta: 0.021,
    contactableGuestRateDelta: 0.008,
  }

  // ── Lead capture funnel ────────────────────────────────────────────
  const supportTouched = Math.round(250 * scale)
  const lcfStartLocal = totalConversations
  const lcfRaw = [
    { label: 'Conversation started', count: totalConversations },
    { label: 'Guest engaged', count: engaged },
    { label: 'Identity known', count: known },
    { label: 'Contact captured', count: contactable },
    { label: 'Support touched', count: supportTouched },
  ]
  const leadCaptureFunnel: LeadCaptureFunnelProps = {
    steps: lcfRaw.map((s, i, arr) => ({
      label: s.label,
      count: s.count,
      shareOfStarted: s.count / lcfStartLocal,
      shareOfPreviousStep: i === 0 ? undefined : s.count / arr[i - 1].count,
    })),
    engagementRate,
    contactCaptureRate: contactable / totalConversations,
    supportTouchedRate: supportTouched / totalConversations,
  }

  // ── Friction pages (top 15, scaled) ────────────────────────────────
  const baselinePages: Array<{ path: string; convs: number; checkout: boolean }> = [
    { path: '/best-spring-break-ever', convs: 10539, checkout: false },
    { path: '/', convs: 8935, checkout: false },
    { path: '/live-mountain-cams', convs: 8244, checkout: false },
    { path: 'shop/onepagecheckout', convs: 7522, checkout: true },
    { path: 'shop/lift-tickets', convs: 5621, checkout: true },
    { path: '/mountain-report', convs: 4654, checkout: false },
    { path: 'shop/order/history', convs: 3221, checkout: true },
    { path: '/kings-queens-corbets', convs: 2802, checkout: false },
    { path: 'shop/lift-tickets-rentals', convs: 2553, checkout: true },
    { path: 'shop/ordercomplete', convs: 2343, checkout: true },
    { path: 'shop/cart', convs: 2144, checkout: true },
    { path: '/maps/mountain-winter', convs: 1853, checkout: false },
    { path: '/lift-tickets', convs: 1613, checkout: false },
    { path: 'shop/customer/info', convs: 1561, checkout: true },
    { path: '/season-pass', convs: 1178, checkout: false },
  ]
  const frictionPages: FrictionPage[] = baselinePages.map((p) => ({
    path: p.path,
    conversations: Math.round(p.convs * scale),
    isCheckoutFlow: p.checkout,
  }))

  // ── Knowledge gaps (occurrences scale; questions don't change) ─────
  const baselineGaps: Array<{ question: string; occ: number; lastSeen: string }> = [
    { question: 'Can I get a refund on my Mountain Collective reservation?', occ: 412, lastSeen: '2026-05-19T18:42:00Z' },
    { question: "Why can't I complete my waiver signature?", occ: 287, lastSeen: '2026-05-19T16:08:00Z' },
    { question: 'When can Ikon pass holders reserve day use?', occ: 244, lastSeen: '2026-05-19T22:31:00Z' },
    { question: 'Tram frequency and typical wait times?', occ: 198, lastSeen: '2026-05-19T14:55:00Z' },
    { question: 'Can I cancel today’s reservation due to weather?', occ: 156, lastSeen: '2026-05-19T11:12:00Z' },
    { question: 'Help processing payment for lift tickets', occ: 142, lastSeen: '2026-05-19T19:24:00Z' },
    { question: 'How to add a friends-and-family redemption code?', occ: 118, lastSeen: '2026-05-19T15:47:00Z' },
  ]
  const knowledgeGaps: KnowledgeGap[] = baselineGaps.map((g) => ({
    question: g.question,
    occurrences: Math.round(g.occ * scale),
    lastSeen: g.lastSeen,
  }))

  // ── Device experience mix (scale conversations) ────────────────────
  const mobile = Math.round(15082 * scale)
  const desktop = Math.round(7636 * scale)
  const tablet = Math.round(287 * scale)
  const knownDevice = mobile + desktop + tablet
  const deviceExperienceMix: DeviceExperienceMixProps = {
    devices: [
      { deviceCategory: 'MOBILE', conversations: mobile, share: mobile / knownDevice, failedConversations: Math.round(121 * scale), failedRate: 0.008 },
      { deviceCategory: 'DESKTOP', conversations: desktop, share: desktop / knownDevice, failedConversations: Math.round(58 * scale), failedRate: 0.0076 },
      { deviceCategory: 'TABLET', conversations: tablet, share: tablet / knownDevice, failedConversations: Math.round(4 * scale), failedRate: 0.014 },
    ],
    browsers: [
      { browser: 'Safari', conversations: Math.round(11150 * scale), share: 0.484 },
      { browser: 'Chrome', conversations: Math.round(11400 * scale), share: 0.495 },
      { browser: 'Firefox', conversations: Math.round(307 * scale), share: 0.013 },
      { browser: 'Edge', conversations: Math.round(142 * scale), share: 0.006 },
      { browser: 'Samsung', conversations: Math.round(41 * scale), share: 0.002 },
      { browser: 'Other', conversations: Math.round(36 * scale), share: 0.0015 },
    ],
    mobileShare: mobile / knownDevice,
    desktopShare: desktop / knownDevice,
    tabletShare: tablet / knownDevice,
    mobileShareDelta: 0.018,
  }

  // ── Guest locations (offline IP → geo; demo mirrors real JH shape) ──
  const guestLocations: GuestLocationsProps = {
    totalLocated: Math.round(20545 * scale),
    countryCount: 42,
    markets: [
      { label: 'United States', conversations: Math.round(19432 * scale), share: 0.946 },
      { label: 'Canada', conversations: Math.round(215 * scale), share: 0.010 },
      { label: 'International', conversations: Math.round(898 * scale), share: 0.044 },
    ],
    cities: [
      { label: 'Jackson, WY', conversations: Math.round(2145 * scale), share: 0.104 },
      { label: 'Denver, CO', conversations: Math.round(934 * scale), share: 0.045 },
      { label: 'New York, NY', conversations: Math.round(701 * scale), share: 0.034 },
      { label: 'Idaho Falls, ID', conversations: Math.round(524 * scale), share: 0.026 },
      { label: 'Missoula, MT', conversations: Math.round(417 * scale), share: 0.020 },
      { label: 'Salt Lake City, UT', conversations: Math.round(360 * scale), share: 0.018 },
      { label: 'Phoenix, AZ', conversations: Math.round(319 * scale), share: 0.016 },
      { label: 'Chicago, IL', conversations: Math.round(260 * scale), share: 0.013 },
    ],
    cityPoints: [
      { city: 'Jackson', lat: 43.48, lon: -110.76, conversations: Math.round(2145 * scale) },
      { city: 'Denver', lat: 39.74, lon: -104.99, conversations: Math.round(934 * scale) },
      { city: 'New York', lat: 40.71, lon: -74.01, conversations: Math.round(701 * scale) },
      { city: 'Idaho Falls', lat: 43.49, lon: -112.03, conversations: Math.round(524 * scale) },
      { city: 'Missoula', lat: 46.87, lon: -113.99, conversations: Math.round(417 * scale) },
      { city: 'Salt Lake City', lat: 40.76, lon: -111.89, conversations: Math.round(360 * scale) },
      { city: 'Phoenix', lat: 33.45, lon: -112.07, conversations: Math.round(319 * scale) },
      { city: 'Chicago', lat: 41.88, lon: -87.63, conversations: Math.round(260 * scale) },
    ],
  }

  // ── Demand heatmap (scale every cell) ──────────────────────────────
  const HEATMAP_DAYS2: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const HEATMAP_BUCKETS2: TimeBucket[] = [
    '12AM–3AM', '3AM–6AM', '6AM–9AM', '9AM–12PM',
    '12PM–3PM', '3PM–6PM', '6PM–9PM', '9PM–12AM',
  ]
  const heatmapDayWeightSum = HEATMAP_DAYS2.reduce((s, d) => s + dayWeight[d], 0)
  const heatmapTotal = totalConversations
  const cells: DemandHeatmapCell[] = []
  let peak: DemandHeatmapCell | undefined
  for (const day of HEATMAP_DAYS2) {
    const dayShare = dayWeight[day] / heatmapDayWeightSum
    const dayTotal = heatmapTotal * dayShare
    for (const bucket of HEATMAP_BUCKETS2) {
      const v = Math.round(dayTotal * bucketBase[bucket])
      const cell: DemandHeatmapCell = {
        dayOfWeek: day,
        timeBucket: bucket,
        conversations: v,
        userMessages: Math.round(v * 0.85),
        failedConversations: Math.round(v * 0.008),
        supportTouchedConversations: Math.round(v * 0.01),
      }
      cells.push(cell)
      if (!peak || cell.conversations > peak.conversations) peak = cell
    }
  }
  let working = 0
  for (const c of cells) {
    const weekend = c.dayOfWeek === 'Sat' || c.dayOfWeek === 'Sun'
    if (!weekend && (c.timeBucket === '9AM–12PM' || c.timeBucket === '12PM–3PM' || c.timeBucket === '3PM–6PM')) {
      working += c.conversations
    }
  }
  const demandHeatmap: DemandHeatmapProps = {
    cells,
    peakCell: peak,
    afterHoursConversations: heatmapTotal - working,
    afterHoursShare: (heatmapTotal - working) / heatmapTotal,
    workingHoursConversations: working,
  }

  const periodLabel = label

  return {
    period,
    periodLabel,
    resolution,
    engagement,
    kpis,
    conversationCounts,
    outcomeTimeline,
    conversionPulse,
    knowledgeSourceLeaderboard,
    knowledgeLayers,
    senderMixStack,
    knowledgeSectionDemand,
    conversionBlockers,
    guestSentiment,
    humanHandover,
    guestIdentitySplit,
    leadCaptureFunnel,
    frictionPages,
    knowledgeGaps,
    deviceExperienceMix,
    guestLocations,
    demandHeatmap,
  }
}
