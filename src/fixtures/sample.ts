/**
 * Realistic fixtures shaped from the Jackson Hole 100k-row chat export.
 * Numbers are derived from actual counts; rates are aspirational for the
 * trend deltas (period-over-period comparisons in the export aren't computed).
 */

import type {
  ActiveUsersPoint,
  ConversationCoverage,
  FrictionPage,
  FunnelRow,
  HourBucket,
  IntentBreakdown,
  KnowledgeGap,
  KpiTileData,
  RatingsSummary,
  ResolutionStats,
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
