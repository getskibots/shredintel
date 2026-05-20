/**
 * Realistic fixtures shaped from the Jackson Hole 100k-row chat export.
 * Numbers are derived from actual counts; rates are aspirational for the
 * trend deltas (period-over-period comparisons in the export aren't computed).
 */

import type {
  ActiveUsersPoint,
  ConversationCoverage,
  ConversionPulseProps,
  DayOfWeek,
  DemandHeatmapCell,
  DemandHeatmapProps,
  DeviceExperienceMixProps,
  FrictionPage,
  FunnelRow,
  GuestIdentitySplitProps,
  HourBucket,
  IntentBreakdown,
  KnowledgeGap,
  KnowledgeSourceLeaderboardProps,
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
