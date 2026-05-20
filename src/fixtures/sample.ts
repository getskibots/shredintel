import type {
  ActiveUsersPoint,
  ConversationCoverage,
  FunnelRow,
  HourBucket,
  RatingsSummary,
} from '../types/analytics'

export const sampleActiveUsers: ActiveUsersPoint[] = [
  { date: '2026-05-13', activeUsers: 23, newUsers: 18 },
  { date: '2026-05-14', activeUsers: 30, newUsers: 25 },
  { date: '2026-05-15', activeUsers: 16, newUsers: 12 },
  { date: '2026-05-16', activeUsers: 17, newUsers: 14 },
  { date: '2026-05-17', activeUsers: 16, newUsers: 12 },
  { date: '2026-05-18', activeUsers: 23, newUsers: 17 },
  { date: '2026-05-19', activeUsers: 10, newUsers: 3 },
]

export const sampleCoverage: ConversationCoverage = {
  byAgent: 100,
  byCustomerSupport: 0,
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
