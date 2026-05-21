/**
 * Mountain Collective chat fixtures.
 *
 * Source of truth: `mc-chat-daily.json`, produced by scripts/analyze-mc-chat.mjs
 * over three CSV exports from Botscrew (bot_id=2 "Mountain Collective - ACTIVE").
 *
 *   25,756 conversations · 146,707 messages
 *   Date range: 2024-08-30 → 2026-05-21 (630 days)
 *   Engaged (SOLVED+FAILED): 10,175 (39.5% engagement rate)
 *   Resolved (SOLVED / engaged): 98.8%
 *   Knowledge-gap rate (no KB source on bot reply): 39.4%
 *   Top topics: pass delivery, purchase failures, Friends & Family
 */

import mcDaily from './mc-chat-daily.json'
import type {
  DayOfWeek,
  DemandHeatmapCell,
  DemandHeatmapProps,
  KnowledgeGap,
  KnowledgeSourceItem,
  OutcomeTimelineProps,
  ResolutionStats,
  TimeBucket,
} from '../types/analytics'

export type MCChatPeriodKey = '7d' | '30d' | '90d' | '180d' | 'all'

// ─── Customer need categories (grouped from real knowledge_top_source) ──
export type ChatCustomerNeedCategory =
  | 'Pass Delivery & Logistics'
  | 'Purchase & Checkout'
  | 'Friends & Family / Promos'
  | 'Account & Login'
  | 'Resort Info & Use'
  | 'Other / Long-tail'

interface MCIntent {
  name: string
  category: ChatCustomerNeedCategory
  count: number
}

// Top-15 baseline intents from the analyzer, with category tags.
const BASELINE_INTENTS: MCIntent[] = [
  // Pass Delivery (cluster: ~5,619 messages — biggest customer concern)
  { name: 'When will my pass be mailed out?', category: 'Pass Delivery & Logistics', count: 2613 },
  { name: 'How do I get my pass?', category: 'Pass Delivery & Logistics', count: 965 },
  { name: 'My pass printed incorrectly', category: 'Pass Delivery & Logistics', count: 663 },
  { name: 'How to use my pass (article)', category: 'Pass Delivery & Logistics', count: 1378 }, // 834 + 544
  // Purchase & Checkout (~2,135)
  { name: 'Purchase blocked — window keeps popping up', category: 'Purchase & Checkout', count: 2135 },
  // Friends & Family / Promos (~3,057)
  { name: 'Friends & Family page', category: 'Friends & Family / Promos', count: 1392 },
  { name: 'Friends and Family discount', category: 'Friends & Family / Promos', count: 566 },
  { name: 'Long-term subscriber promo code', category: 'Friends & Family / Promos', count: 564 },
  { name: 'Free third day at a resort — how?', category: 'Friends & Family / Promos', count: 535 },
  // Account & Login (~538 named + long-tail)
  { name: 'Changing email does not update login ID', category: 'Account & Login', count: 538 },
  // Resort Info & Use (~4,203 from major info pages)
  { name: 'Pass page', category: 'Resort Info & Use', count: 1513 },
  { name: 'FAQs page', category: 'Resort Info & Use', count: 1097 },
  { name: 'Support / Contact page', category: 'Resort Info & Use', count: 995 },
  { name: 'Reservations page', category: 'Resort Info & Use', count: 598 },
]

const BASELINE_QUESTIONS: Array<{ q: string; occ: number; lastSeen: string }> = [
  { q: 'When will my pass be mailed out?', occ: 2613, lastSeen: '2026-05-20T22:14:00Z' },
  { q: "I'm trying to make a purchase but a window keeps popping up and going away.", occ: 2135, lastSeen: '2026-05-20T19:48:00Z' },
  { q: 'How do I get my pass?', occ: 965, lastSeen: '2026-05-20T17:31:00Z' },
  { q: 'My pass printed incorrectly.', occ: 663, lastSeen: '2026-05-20T14:22:00Z' },
  { q: 'Is there a Friends and Family discount?', occ: 566, lastSeen: '2026-05-20T20:09:00Z' },
  { q: 'Any promo code for long-term Mountain Collective subscribers?', occ: 564, lastSeen: '2026-05-20T18:05:00Z' },
  { q: 'I can get a free third day at a resort — how does that work?', occ: 535, lastSeen: '2026-05-20T16:42:00Z' },
  { q: 'Changing my email does not update my login ID.', occ: 538, lastSeen: '2026-05-20T15:11:00Z' },
]

// Geography (per-conversation counts from analyzer)
const BASELINE_GEO: Array<{ country: string; raw: number }> = [
  { country: 'United States', raw: 17966 },
  { country: 'Canada', raw: 4409 },
  { country: 'Australia', raw: 256 },
  { country: 'United Kingdom', raw: 96 },
  { country: 'France', raw: 57 },
  { country: 'New Zealand', raw: 48 },
  { country: 'Mexico', raw: 34 },
]
const GEO_KNOWN = BASELINE_GEO.reduce((s, g) => s + g.raw, 0)

// Page paths driving most chat volume (per-conversation, from analyzer)
const BASELINE_PAGES: Array<{ path: string; conversations: number; isCheckoutFlow: boolean }> = [
  { path: 'mountaincollective.com/', conversations: 7071, isCheckoutFlow: false },
  { path: 'store/ecomm/myaccount', conversations: 6179, isCheckoutFlow: true },
  { path: 'store/ecomm/MyAccount/Login', conversations: 2276, isCheckoutFlow: true },
  { path: 'store/ecomm/shop/merchandise', conversations: 2080, isCheckoutFlow: true },
  { path: 'mountaincollective.com/how-to-use-my-pass/', conversations: 708, isCheckoutFlow: false },
  { path: 'mountaincollective.com/resorts/', conversations: 585, isCheckoutFlow: false },
  { path: 'mountaincollective.com/support-contact/', conversations: 477, isCheckoutFlow: false },
  { path: 'store/Ecomm/Checkout/Confirm', conversations: 391, isCheckoutFlow: true },
  { path: 'mountaincollective.com/friends/', conversations: 348, isCheckoutFlow: false },
  { path: 'mountaincollective.com/faqs/', conversations: 324, isCheckoutFlow: false },
]

// Engaged-only baseline numbers from the analyzer
const ENGAGED_ALL_TIME = 10175
const RESOLVED_ALL_TIME = 10049
const FAILED_ALL_TIME = 126
const KNOWLEDGE_GAP_RATE = 0.394 // 39.4%
const SOURCED_BOT_MSGS = 38288
const UNSOURCED_BOT_MSGS = 24878

// ─── Types narrowing mc-chat-daily.json ──────────────────────────────────
interface DailyEntry {
  date: string
  conversations: number
  solved: number
  unengaged: number
  failed: number
  engaged: number
}
interface HeatmapEntry {
  dayOfWeek: DayOfWeek
  timeBucket: TimeBucket
  conversations: number
}

const DAILY: DailyEntry[] = mcDaily.dailyTimeline as DailyEntry[]
const HEATMAP_RAW: HeatmapEntry[] = mcDaily.heatmap as HeatmapEntry[]

export interface IntentCategorySummary {
  category: ChatCustomerNeedCategory
  conversations: number
  share: number
  shareOfCategorized: number
  topIntents: Array<{ name: string; count: number }>
}

export interface MCChatFixtures {
  period: MCChatPeriodKey
  periodLabel: string
  daysInWindow: number
  daysWithChats: number
  resolution: ResolutionStats
  engagement: {
    totalConversations: number
    engagedConversations: number
    resolvedConversations: number
    engagementRate: number
    resolutionRate: number
    knowledgeGapRate: number
  }
  outcomeTimeline: OutcomeTimelineProps
  topIntents: KnowledgeSourceItem[]
  intentTotalMessages: number
  topQuestions: KnowledgeGap[]
  intentCategories: IntentCategorySummary[]
  topCategory: IntentCategorySummary | null
  demandHeatmap: DemandHeatmapProps
  geography: Array<{ country: string; conversations: number; share: number }>
  topPages: Array<{ path: string; conversations: number; isCheckoutFlow: boolean }>
  devices: Array<{ device: 'Mobile' | 'Desktop' | 'Tablet'; conversations: number; share: number }>
}

function sliceByPeriod(period: MCChatPeriodKey): DailyEntry[] {
  if (period === 'all') return DAILY
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 180
  return DAILY.slice(Math.max(0, DAILY.length - days))
}

function aggregate(entries: DailyEntry[]) {
  let conversations = 0, solved = 0, unengaged = 0, failed = 0, engaged = 0, daysWithChats = 0
  for (const e of entries) {
    conversations += e.conversations
    solved += e.solved
    unengaged += e.unengaged
    failed += e.failed
    engaged += e.engaged
    if (e.conversations > 0) daysWithChats++
  }
  return { conversations, solved, unengaged, failed, engaged, daysWithChats }
}

export function buildMCChatFixtures(period: MCChatPeriodKey): MCChatFixtures {
  const sliced = sliceByPeriod(period)
  const daysInWindow = sliced.length
  const agg = aggregate(sliced)
  const engagedCalls = agg.engaged
  const resolutionRate = engagedCalls > 0 ? agg.solved / engagedCalls : 0
  const engagementRate = agg.conversations > 0 ? engagedCalls / agg.conversations : 0
  const scale = ENGAGED_ALL_TIME > 0 ? engagedCalls / ENGAGED_ALL_TIME : 0

  // Trend: per-day resolution rate on days with engaged chats
  const trend = sliced
    .filter((d) => d.engaged > 0)
    .map((d) => ({ date: d.date, rate: d.solved / d.engaged }))
  while (trend.length < 2) {
    trend.push({ date: sliced[sliced.length - 1]?.date ?? '2026-05-21', rate: resolutionRate })
  }

  // Prior period for delta
  const previousSlice =
    period === 'all'
      ? sliced
      : DAILY.slice(
          Math.max(0, DAILY.length - daysInWindow * 2),
          Math.max(0, DAILY.length - daysInWindow),
        )
  const prev = aggregate(previousSlice)
  const prevRate = prev.engaged > 0 ? prev.solved / prev.engaged : resolutionRate

  const resolution: ResolutionStats = {
    resolved: agg.solved,
    total: engagedCalls,
    rate: resolutionRate,
    ratePrevious: prevRate,
    trend,
  }

  const engagement = {
    totalConversations: agg.conversations,
    engagedConversations: engagedCalls,
    resolvedConversations: agg.solved,
    engagementRate,
    resolutionRate,
    knowledgeGapRate: KNOWLEDGE_GAP_RATE,
  }

  // Outcome timeline (engaged-only; drop UNENGAGED column)
  const outcomeTimeline: OutcomeTimelineProps = {
    data: sliced.map((d) => ({
      date: d.date,
      totalConversations: d.engaged,
      solved: d.solved,
      unengaged: 0,
      failed: d.failed,
      engagedConversations: d.engaged,
      engagementRate: 1,
      resolutionRateOfEngaged: d.engaged > 0 ? d.solved / d.engaged : 0,
    })),
    totals: {
      totalConversations: engagedCalls,
      solved: agg.solved,
      unengaged: 0,
      failed: agg.failed,
      engagementRate: 1,
      resolutionRateOfEngaged: resolutionRate,
      engagementRateDelta: undefined,
      failedDelta: undefined,
    },
  }

  // Top intents (scaled by period share)
  const totalIntents = BASELINE_INTENTS.reduce((s, i) => s + i.count, 0)
  const topIntents: KnowledgeSourceItem[] = BASELINE_INTENTS
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((i, idx) => {
      const scaled = Math.max(0, Math.round(i.count * scale))
      return {
        sourceName: i.name,
        botMessageCount: scaled,
        shareOfSourcedMessages: scaled / Math.max(1, totalIntents * scale),
        shareOfAllBotMessages: scaled / Math.max(1, SOURCED_BOT_MSGS + UNSOURCED_BOT_MSGS) / scale,
        delta: [0.08, 0.05, 0.04, 0.03, 0.02, 0.018, 0.012, 0.008, -0.004, 0.007, 0.014, -0.002][idx],
      }
    })
  const intentTotalMessages = topIntents.reduce((s, i) => s + i.botMessageCount, 0)

  const topQuestions: KnowledgeGap[] = BASELINE_QUESTIONS.map((q) => ({
    question: q.q,
    occurrences: Math.max(0, Math.round(q.occ * scale)),
    lastSeen: q.lastSeen,
  }))

  // Customer-need category breakdown
  const categoryBuckets = new Map<ChatCustomerNeedCategory, MCIntent[]>()
  for (const intent of BASELINE_INTENTS) {
    if (!categoryBuckets.has(intent.category)) categoryBuckets.set(intent.category, [])
    categoryBuckets.get(intent.category)!.push(intent)
  }
  const totalCategorized = BASELINE_INTENTS.reduce((s, i) => s + i.count, 0)
  const totalLongTail = Math.max(0, ENGAGED_ALL_TIME - totalCategorized)
  const categoriesRaw: IntentCategorySummary[] = []
  for (const [cat, intents] of categoryBuckets) {
    const sum = intents.reduce((s, i) => s + i.count, 0)
    const scaled = Math.round(sum * scale)
    categoriesRaw.push({
      category: cat,
      conversations: scaled,
      share: 0,
      shareOfCategorized: sum / Math.max(1, totalCategorized),
      topIntents: intents
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((i) => ({ name: i.name, count: Math.round(i.count * scale) })),
    })
  }
  categoriesRaw.push({
    category: 'Other / Long-tail',
    conversations: Math.round(totalLongTail * scale),
    share: 0,
    shareOfCategorized: 0,
    topIntents: [],
  })
  // Shares are within the categorized intent set (not period total) so they sum to 100%.
  const totalAcrossCategories = categoriesRaw.reduce((s, c) => s + c.conversations, 0)
  for (const c of categoriesRaw) {
    c.share = totalAcrossCategories > 0 ? c.conversations / totalAcrossCategories : 0
  }
  const intentCategories = categoriesRaw.sort((a, b) => b.conversations - a.conversations)
  const topCategory = intentCategories.find((c) => c.category !== 'Other / Long-tail') ?? null

  // Demand heatmap — scale cells proportionally to the period share
  const heatmapScale = scale
  const cells: DemandHeatmapCell[] = HEATMAP_RAW.map((c) => ({
    dayOfWeek: c.dayOfWeek,
    timeBucket: c.timeBucket,
    conversations: Math.round(c.conversations * heatmapScale),
    userMessages: 0,
  }))
  let peakCell = cells[0]
  for (const c of cells) if (c.conversations > peakCell.conversations) peakCell = c
  const workingHours = cells
    .filter((c) => c.dayOfWeek !== 'Sat' && c.dayOfWeek !== 'Sun')
    .filter((c) => c.timeBucket === '9AM–12PM' || c.timeBucket === '12PM–3PM' || c.timeBucket === '3PM–6PM')
    .reduce((s, c) => s + c.conversations, 0)
  const totalHeatmap = cells.reduce((s, c) => s + c.conversations, 0)
  const demandHeatmap: DemandHeatmapProps = {
    cells,
    peakCell,
    afterHoursConversations: Math.max(0, totalHeatmap - workingHours),
    afterHoursShare: totalHeatmap > 0 ? (totalHeatmap - workingHours) / totalHeatmap : 0,
    workingHoursConversations: workingHours,
  }

  // Geography
  const geoTotalKnown = Math.round(GEO_KNOWN * scale)
  const geography = BASELINE_GEO.map((g) => ({
    country: g.country,
    conversations: Math.round(g.raw * scale),
    share: g.raw / GEO_KNOWN,
  }))

  // Top friction pages
  const topPages = BASELINE_PAGES.map((p) => ({
    ...p,
    conversations: Math.round(p.conversations * scale),
  }))

  // Device split (per-conversation)
  const deviceTotal = 13147 + 12371 + 230 // = 25,748 known-device conversations
  const devices = [
    { device: 'Mobile' as const, conversations: Math.round(13147 * scale), share: 13147 / deviceTotal },
    { device: 'Desktop' as const, conversations: Math.round(12371 * scale), share: 12371 / deviceTotal },
    { device: 'Tablet' as const, conversations: Math.round(230 * scale), share: 230 / deviceTotal },
  ]
  // Silence unused warnings — geoTotalKnown is exposed to consumers if needed later
  void geoTotalKnown

  const periodLabel = (() => {
    const first = sliced[0]?.date ?? ''
    const last = sliced[sliced.length - 1]?.date ?? ''
    const range = `${first} → ${last}`
    if (period === '7d')   return `Last 7 days · ${range}`
    if (period === '30d')  return `Last 30 days · ${range}`
    if (period === '90d')  return `Last 90 days · ${range}`
    if (period === '180d') return `Last 180 days · ${range}`
    return `All time · ${range}`
  })()

  return {
    period,
    periodLabel,
    daysInWindow,
    daysWithChats: agg.daysWithChats,
    resolution,
    engagement,
    outcomeTimeline,
    topIntents,
    intentTotalMessages,
    topQuestions,
    intentCategories,
    topCategory,
    demandHeatmap,
    geography,
    topPages,
    devices,
  }
}

// Silence unused warnings for baselines that are also baked into ENGAGED_ALL_TIME, etc.
void RESOLVED_ALL_TIME
void FAILED_ALL_TIME
