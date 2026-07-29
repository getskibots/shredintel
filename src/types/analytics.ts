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

// ─────────────────────────────────────────────────────────────────────────
// Brief: 8 new components mapping to §1–§4 of the Botscrew export.
// All PII fields (email/phone/first_name/last_name/username/ip) are
// deliberately absent from these types — aggregates only.
// ─────────────────────────────────────────────────────────────────────────

export interface AnalyticsDelta {
  value: number
  direction: 'up' | 'down' | 'flat'
}

// § 1 — OutcomeTimeline

export interface OutcomeTimelinePoint {
  date: string
  totalConversations: number
  solved: number
  unengaged: number
  failed: number
  engagedConversations: number
  engagementRate: number
  resolutionRateOfEngaged: number
}

export interface OutcomeTimelineProps {
  data: OutcomeTimelinePoint[]
  totals: {
    totalConversations: number
    solved: number
    unengaged: number
    failed: number
    engagementRate: number
    resolutionRateOfEngaged: number
    engagementRateDelta?: number
    failedDelta?: number
  }
}

// § 1 — ConversionPulse

export interface ConversionTimelinePoint {
  date: string
  convertedConversations: number
  totalConversations: number
  engagedConversations: number
  conversionShareOfTotal: number
  conversionShareOfEngaged: number
}

export interface ConversionPulseProps {
  totalConverted: number
  conversionShareOfTotal: number
  conversionShareOfEngaged: number
  convertedDelta?: number
  bestDay?: {
    date: string
    convertedConversations: number
  }
  timeline: ConversionTimelinePoint[]
}

// § 1 — ConversationCounts  (spec: "Extended Conversation Counts")
// Sessions vs. messages, depth per session, bounce (single-user-message)
// sessions, and time-to-first-response. Sourced from report.conversation_depth.

export interface ConversationCountsPoint {
  date: string
  sessions: number
  engaged: number
  messages: number
  userMessages: number
}

export interface ConversationCountsProps {
  /** Distinct users (visitors) in the period — matches Botscrew "Active users".
   *  Undefined when the active_users RPC isn't available (older/demo). */
  users?: number
  /** Substantive conversations (engaged + a real question) — the AI's analysis
   *  base = Σ intel_section. Undefined when enrichment isn't available. */
  substantive?: number
  /** Total conversations (sessions) in the period */
  sessions: number
  /** Total messages (real, visible) in the period */
  messages: number
  userMessages: number
  /** Bot (AI) messages in the period — from sender_mix_stack, so it excludes
   *  live-agent messages. Optional (absent in fixtures). */
  botMessages?: number
  /** Fleet median engagement rate (0-1) — the "vs typical resort" benchmark.
   *  Optional; absent → no benchmark shown on the hero. */
  engagementBenchmark?: number
  /** Sessions with ≥1 real user message */
  engagedSessions: number
  /** Sessions where the user sent exactly one message (bounce) */
  singleUserMsgSessions: number
  /** Bounce rate = singleUserMsgSessions / engagedSessions (0-1) */
  singleMsgShareOfEngaged: number
  /** messages / sessions */
  messagesPerSession: number
  /** userMessages / sessions */
  userMessagesPerSession: number
  /** avg user messages among engaged sessions */
  avgUserMsgsPerEngaged: number
  /** Time from first user message to first bot/support reply, seconds */
  avgFirstResponseSec: number | null
  medianFirstResponseSec: number | null
  /** Optional deltas vs prior period (omitted for live until prior-window fetch exists) */
  sessionsDelta?: number
  messagesDelta?: number
  /** Daily series for the sessions-vs-messages chart */
  trend: ConversationCountsPoint[]
}

// § 2 — ShredIntel enrichment panels (AI-classified per conversation)

export interface BreakdownItem {
  label: string
  conversations: number
  share: number       // 0-1 of substantive conversations
  negative?: number   // negative-sentiment count (used by pinchpoints)
}

/** Guest demand across resort knowledge sections (topic taxonomy). */
export interface KnowledgeSectionDemandProps {
  sections: BreakdownItem[]
  totalSubstantive: number
}

/** Ecommerce / account conversion blockers (cross-cutting pinchpoints). */
export interface ConversionBlockersProps {
  blockers: BreakdownItem[]
  affectedConversations: number
  affectedShare: number  // pinchpoint-tagged / substantive
}

/** Overall guest sentiment split. */
export interface GuestSentimentProps {
  positive: number
  neutral: number
  negative: number
  total: number
  positiveShare: number
  negativeShare: number
}

/** Human handover — how often a person is NEEDED (segments = No / Possible /
 *  Clear handover, for the donut) vs how often one ACTUALLY steps in
 *  (escalated), and the gap between them. */
export interface HumanHandoverProps {
  segments: { label: string; conversations: number; share: number }[]
  totalSubstantive: number
  neededHuman: number
  neededHumanShare: number
  clearHandover: number
  escalated: number
  gap: number
}

/** Needs attention — how urgent the guest's need was (segments = Low / Medium /
 *  High / Escalation Required, from the AI enrichment). `urgent` = High +
 *  Escalation (the headline "needed a fast look" count); `escalation` isolates
 *  the hardest subset. Channel-agnostic (chat + voice). */
export interface UrgencyProps {
  segments: { label: string; conversations: number; share: number }[]
  total: number
  urgent: number
  urgentShare: number
  escalation: number
}

// § 2 — KnowledgeSourceLeaderboard

export interface KnowledgeSourceItem {
  sourceName: string
  botMessageCount: number
  shareOfSourcedMessages: number
  shareOfAllBotMessages: number
  delta?: number
}

export interface KnowledgeSourceLeaderboardProps {
  sourcedBotMessages: number
  unsourcedBotMessages: number
  knowledgeGapRate: number
  topSources: KnowledgeSourceItem[]
}

// Where the bot's answers come from, by Botscrew Knowledge Layer (the exact
// layers the resort manages in their admin) + Failed. From report.knowledge_layer_mix.
export interface KnowledgeLayerDatum {
  /** 'Text Edits' | 'Website' | 'Instructions' | 'Files' | 'Failed' */
  layer: string
  answers: number
}

// One topic's answer-source mix (the fill-list unit).
export interface KnowledgeTopicCoverage {
  section: string
  total: number
  layers: KnowledgeLayerDatum[]
}

export interface KnowledgeLayersProps {
  layers: KnowledgeLayerDatum[]
  /** Per-topic layer mix — the fill-list. Optional (Phase 2). */
  byTopic?: KnowledgeTopicCoverage[]
}

// § 2 — SenderMixStack

export interface SenderMixPoint {
  date: string
  botMessages: number
  userMessages: number
  supportMessages: number
  totalMessages: number
}

export interface SenderMixStackProps {
  totals: {
    botMessages: number
    userMessages: number
    supportMessages: number
    totalMessages: number
    botMessageShare: number
    supportMessageShare: number
    avgMessagesPerEngagedConversation: number
  }
  data: SenderMixPoint[]
}

// § 3 — GuestIdentitySplit

export interface GuestIdentitySplitProps {
  totalConversations: number
  knownGuests: number
  anonymousGuests: number
  contactableGuests: number
  knownGuestRate: number
  contactableGuestRate: number
  knownGuestRateDelta?: number
  contactableGuestRateDelta?: number
}

// § 3 — LeadCaptureFunnel

export interface LeadCaptureFunnelStep {
  label: string
  count: number
  shareOfStarted: number
  shareOfPreviousStep?: number
}

export interface LeadCaptureFunnelProps {
  steps: LeadCaptureFunnelStep[]
  engagementRate: number
  contactCaptureRate: number
  supportTouchedRate: number
}

// § 4 — DeviceExperienceMix

export interface DeviceItem {
  deviceCategory: 'MOBILE' | 'DESKTOP' | 'TABLET' | 'UNKNOWN'
  conversations: number
  share: number
  failedConversations?: number
  failedRate?: number
}

export interface BrowserItem {
  browser: string
  conversations: number
  share: number
}

export interface DeviceExperienceMixProps {
  devices: DeviceItem[]
  browsers: BrowserItem[]
  mobileShare: number
  desktopShare: number
  tabletShare: number
  mobileShareDelta?: number
}

// § 4 — Guest locations (offline IP → GeoLite2). Cities are BreakdownItems so
// they drill to the conversations like the other breakdowns; markets is the
// US / Canada / International split. Scoped to substantive = real guests.
export interface GuestLocationsProps {
  cities: BreakdownItem[]
  /** City points with coordinates for the US dot-map (offline albersUsa). */
  cityPoints: { city: string; lat: number; lon: number; conversations: number }[]
  markets: BreakdownItem[]
  totalLocated: number
  countryCount: number
}

// § 4 — DemandHeatmap

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export type TimeBucket =
  | '12AM–3AM'
  | '3AM–6AM'
  | '6AM–9AM'
  | '9AM–12PM'
  | '12PM–3PM'
  | '3PM–6PM'
  | '6PM–9PM'
  | '9PM–12AM'

export interface DemandHeatmapCell {
  dayOfWeek: DayOfWeek
  timeBucket: TimeBucket
  conversations: number
  userMessages: number
  failedConversations?: number
  supportTouchedConversations?: number
}

export interface DemandHeatmapProps {
  cells: DemandHeatmapCell[]
  peakCell?: DemandHeatmapCell
  afterHoursConversations: number
  afterHoursShare: number
  workingHoursConversations: number
}

// § 4 (redesign) — DemandRhythm: "When your guests reach out"
// Three clear views off report.demand_hours: an hourly filled-area curve, a
// day-of-week bar chart, and a working- vs after-hours donut.

/** One point on the 24-hour curve (resort-local). */
export interface DemandHourPoint {
  hour: number // 0..23
  conversations: number
}

/** One bar in the day-of-week chart (Mon..Sun order). */
export interface DemandDayPoint {
  day: DayOfWeek
  isodow: number // 1=Mon..7=Sun
  conversations: number
}

export interface DemandRhythmProps {
  /** 24 points, hour 0..23, resort-local. Empty → section shows empty state. */
  hourly: DemandHourPoint[]
  /** 7 bars, Mon..Sun. */
  byDay: DemandDayPoint[]
  /** Working = Mon–Fri, 9 AM–6 PM (local). */
  workingConversations: number
  afterHoursConversations: number
  afterHoursShare: number
  /** Busiest single local hour, for the callout badge. */
  peakHour?: DemandHourPoint
  /** Busiest day of week, for the callout badge. */
  peakDay?: DemandDayPoint
}
