/**
 * Shared types for shredintel analytics components.
 *
 * Botscrew integration: these are the data shapes each chart component
 * expects via props. Wire your API responses to these shapes — no transforms
 * needed inside the components.
 */

export type DateRange = 'last_7_days' | 'last_30_days' | { from: string; to: string }

export interface ActiveUsersPoint {
  date: string // ISO date (YYYY-MM-DD)
  activeUsers: number
  newUsers: number
}

export interface ConversationCoverage {
  byAgent: number
  byCustomerSupport: number
}

export interface HourBucket {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sun
  hour: number // 0-23
  conversations: number
}

export interface RatingsSummary {
  averageRating: number // 0-5
  totalRatings: number
  reviews: Array<{
    id: string
    rating: number
    comment?: string
    createdAt: string
  }>
}

export interface FunnelRow {
  id: string
  name: string
  steps: number
  totalConversations: number
  completionRate: number // 0-1
}
