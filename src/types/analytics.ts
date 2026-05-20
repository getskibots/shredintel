/**
 * Shared types for shredintel analytics components.
 *
 * Field shapes are derived from the existing Botscrew chat export
 * (Sections 1–4: Conversation Core, Message Intelligence, User Identity,
 * Behavioral Context).
 */

export type DateRange = 'last_7_days' | 'last_30_days' | { from: string; to: string }

/** Mirrors `conversation_outcome` in the export */
export type ConversationOutcome = 'SOLVED' | 'UNENGAGED' | 'FAILED'

/** Mirrors `status` in the export */
export type ConversationStatus = 'READ' | 'DELIVERED' | 'SENT' | 'CONVERTED'

export interface ResolutionStats {
  /** Conversations the bot resolved (outcome=SOLVED) */
  resolved: number
  /** Total conversations in the period */
  total: number
  /** Resolution rate this period (0-1) */
  rate: number
  /** Resolution rate last period (0-1), for delta */
  ratePrevious: number
  /** Daily series for the sparkline (0-1 rate per day) */
  trend: Array<{ date: string; rate: number }>
}

export interface KpiTileData {
  label: string
  value: string
  /** Optional caption beneath the value */
  caption?: string
  /** Delta vs prior period, e.g. "+12%" */
  delta?: string
  /** Affects delta badge color */
  deltaTone?: 'positive' | 'negative' | 'neutral' | 'alert'
  /** Optional accent for the tile itself */
  accent?: 'glacier' | 'summit' | 'success' | 'danger' | 'none'
}

/** A page that drove chat volume — top friction surface */
export interface FrictionPage {
  path: string
  conversations: number
  /** Marks pages in the conversion path (cart, checkout, order) */
  isCheckoutFlow: boolean
}

export interface KnowledgeGap {
  /** A representative question or theme */
  question: string
  /** How many times the bot answered this without a knowledge source */
  occurrences: number
  /** Optional last-seen ISO timestamp */
  lastSeen?: string
}

// — Original fields preserved for v1 parity / future migration —

export interface ActiveUsersPoint {
  date: string
  activeUsers: number
  newUsers: number
}

export interface ConversationCoverage {
  byAgent: number
  byCustomerSupport: number
}

export interface HourBucket {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  hour: number
  conversations: number
}

export interface RatingsSummary {
  averageRating: number
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
  completionRate: number
}

export interface IntentBreakdown {
  intent: string
  total: number
  unresolved: number
  unresolvedRate: number
}
