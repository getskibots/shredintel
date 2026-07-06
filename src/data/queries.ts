/**
 * Supabase query layer for the `report.*` schema built by Dru's ETL.
 *
 * Contract (from drumanshoo/get-ski-bots pipeline/schema/004_report_views.sql):
 *   report.outcome_timeline             (bot_id, day, total_conversations, solved, unengaged, failed, engaged_conversations, engagement_rate, resolution_rate_of_engaged)
 *   report.conversion_pulse             (bot_id, day, converted_conversations, total_conversations, engaged_conversations, conversion_share_of_total, conversion_share_of_engaged)
 *   report.knowledge_source_leaderboard (bot_id, day, source_name, bot_message_count, failed_count)
 *   report.sender_mix_stack             (bot_id, day, bot_messages, user_messages, support_messages, total_messages)
 *   report.guest_identity_split         (bot_id, day, total_conversations, known_guests, anonymous_guests, contactable_guests)
 *   report.lead_capture_funnel          (bot_id, day, started, engaged, asked_bot, contacted, support_touched)
 *   report.device_experience_mix        (bot_id, day, dimension='device'|'browser', key, conversations, failed_conversations)
 *   report.demand_heatmap               (bot_id, day, day_of_week, time_bucket, conversations, user_messages)
 *
 * All 8 views are SELECT-granted to the anon role via migration 006.
 * `report` schema must be added to Supabase → Settings → API → Exposed schemas.
 */

import { getSupabase } from '../lib/supabase'

// Row shapes as returned by PostgREST
export interface OutcomeRow {
  bot_id: number
  day: string
  total_conversations: number
  solved: number
  unengaged: number
  failed: number
  engaged_conversations: number
  engagement_rate: number
  resolution_rate_of_engaged: number
}

export interface ConversionRow {
  bot_id: number
  day: string
  converted_conversations: number
  total_conversations: number
  engaged_conversations: number
  conversion_share_of_total: number
  conversion_share_of_engaged: number
}

export interface KnowledgeSourceRow {
  bot_id: number
  day: string
  source_name: string
  bot_message_count: number
  failed_count: number
}

export interface SenderMixRow {
  bot_id: number
  day: string
  bot_messages: number
  user_messages: number
  support_messages: number
  total_messages: number
}

export interface GuestIdentityRow {
  bot_id: number
  day: string
  total_conversations: number
  known_guests: number
  anonymous_guests: number
  contactable_guests: number
}

export interface LeadCaptureRow {
  bot_id: number
  day: string
  started: number
  engaged: number
  asked_bot: number
  contacted: number
  support_touched: number
}

export interface DeviceExperienceRow {
  bot_id: number
  day: string
  dimension: 'device' | 'browser'
  key: string | null
  conversations: number
  failed_conversations: number
}

export interface DemandHeatmapRow {
  bot_id: number
  day: string
  day_of_week: string // 'Mon'..'Sun' — verify against Dru's convention
  time_bucket: string // matches TimeBucket in analytics.ts
  conversations: number
  user_messages: number
}

/**
 * report.conversation_depth (bot_id, day) — the one view we added for §1
 * "Extended Conversation Counts": bounce sessions + time-to-first-response.
 * See etl/build-conversation-depth.mjs.
 */
export interface ConversationDepthRow {
  bot_id: number
  day: string
  conversations: number
  engaged_conversations: number
  single_user_msg_sessions: number
  user_messages: number
  total_messages: number
  avg_user_msgs_per_engaged: number | null
  avg_first_response_sec: number | null
  median_first_response_sec: number | null
}

/**
 * report.intel_* views (bot_id, day, key, conversations) — ShredIntel AI
 * enrichment aggregates. `negative` only present on intel_pinchpoint.
 */
export interface IntelBreakdownRow {
  bot_id: number
  day: string
  key: string
  conversations: number
  negative?: number
}

/**
 * report.page_funnel — where guest questions ORIGINATE on the resort site,
 * as an ecommerce funnel stage. report.page_{section,pinchpoint,sentiment}
 * are the same intel_* breakdowns but carrying the funnel_stage dimension,
 * so the dashboard can re-scope the intelligence panels to a single stage.
 */
export interface PageFunnelRow {
  bot_id: number
  day: string
  funnel_stage: string
  stage_rank: number
  conversations: number
  negative: number
}

export interface PageIntelRow {
  bot_id: number
  day: string
  funnel_stage: string
  stage_rank: number
  key: string
  conversations: number
  negative?: number
}

/**
 * report.geo_country / report.geo_city — guest location breakdowns (from the
 * offline IP→GeoLite2 enrichment), scoped to substantive conversations. NO raw
 * IP: only country/region/city + a centroid lat/lon. Empty until the geo views
 * are built (non-fatal, like the page views).
 */
export interface GeoCountryRow {
  bot_id: number
  day: string
  country_iso: string
  country_name: string | null
  conversations: number
}

export interface GeoCityRow {
  bot_id: number
  day: string
  country_iso: string | null
  region: string | null
  city: string
  lat: number | null
  lon: number | null
  conversations: number
}

export interface LiveBundle {
  outcomeTimeline: OutcomeRow[]
  conversionPulse: ConversionRow[]
  knowledgeSourceLeaderboard: KnowledgeSourceRow[]
  senderMixStack: SenderMixRow[]
  guestIdentitySplit: GuestIdentityRow[]
  leadCaptureFunnel: LeadCaptureRow[]
  deviceExperienceMix: DeviceExperienceRow[]
  demandHeatmap: DemandHeatmapRow[]
  conversationDepth: ConversationDepthRow[]
  intelSection: IntelBreakdownRow[]
  intelPinchpoint: IntelBreakdownRow[]
  intelSentiment: IntelBreakdownRow[]
  /** Handover-need split (No / Possible / Clear Handover). Non-fatal. */
  intelHandover: IntelBreakdownRow[]
  /** Page → ecommerce funnel stage (where questions originate) + the same
   *  intelligence breakdowns sliced by stage. Empty until the page-funnel
   *  matview is available (non-fatal, like intel_*). */
  pageFunnel: PageFunnelRow[]
  pageSection: PageIntelRow[]
  pagePinchpoint: PageIntelRow[]
  pageSentiment: PageIntelRow[]
  /** Guest location breakdowns (offline IP→geo). Empty until geo views exist. */
  geoCountry: GeoCountryRow[]
  geoCity: GeoCityRow[]
  /** Distinct users in the window (report.active_users RPC) — matches the
   *  Botscrew admin "Active users" count. null if the RPC isn't available. */
  activeUsers: number | null
}

/**
 * Reject if a promise takes longer than `ms`, so the app falls back to fixtures
 * instead of hanging on "Loading…" forever when Supabase is slow or unreachable
 * (no per-request timeout otherwise — a stalled fetch would never resolve).
 */
function withTimeout<T>(p: Promise<T>, ms = 9000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`live-fetch timed out after ${ms}ms`)), ms),
    ),
  ])
}

/**
 * Fetches all 9 views in parallel, filtered to (bot_id, day BETWEEN from AND to).
 * Returns null if the client isn't configured OR if the report schema isn't
 * reachable (schema not exposed, permissions denied, network error, TIMEOUT).
 * Callers should fall back to fixtures in that case.
 */
export async function fetchLiveBundle(
  botId: number,
  from: string, // 'YYYY-MM-DD'
  to: string,   // 'YYYY-MM-DD'
): Promise<LiveBundle | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const q = <T,>(view: string) =>
    supabase
      .schema('report')
      .from(view)
      .select('*')
      .eq('bot_id', botId)
      .gte('day', from)
      .lte('day', to) as unknown as Promise<{ data: T[] | null; error: unknown }>

  // Distinct users in the window — window-level distinct can't be summed from
  // daily rows, so it's a small read-only RPC (report.active_users).
  const usersRpc = supabase
    .schema('report')
    .rpc('active_users', { p_bot_id: botId, p_from: from, p_to: to }) as unknown as Promise<{ data: number | string | null; error: unknown }>

  try {
    const [outcome, conversion, knowledge, sender, identity, funnel, device, heatmap, depth,
           iSection, iPinch, iSent, iHand, pFunnel, pSection, pPinch, pSent, gCountry, gCity, users] =
      await withTimeout(Promise.all([
        q<OutcomeRow>('outcome_timeline'),
        q<ConversionRow>('conversion_pulse'),
        q<KnowledgeSourceRow>('knowledge_source_leaderboard'),
        q<SenderMixRow>('sender_mix_stack'),
        q<GuestIdentityRow>('guest_identity_split'),
        q<LeadCaptureRow>('lead_capture_funnel'),
        q<DeviceExperienceRow>('device_experience_mix'),
        q<DemandHeatmapRow>('demand_heatmap'),
        q<ConversationDepthRow>('conversation_depth'),
        q<IntelBreakdownRow>('intel_section'),
        q<IntelBreakdownRow>('intel_pinchpoint'),
        q<IntelBreakdownRow>('intel_sentiment'),
        q<IntelBreakdownRow>('intel_handover'),
        q<PageFunnelRow>('page_funnel'),
        q<PageIntelRow>('page_section'),
        q<PageIntelRow>('page_pinchpoint'),
        q<PageIntelRow>('page_sentiment'),
        q<GeoCountryRow>('geo_country'),
        q<GeoCityRow>('geo_city'),
        usersRpc,
      ]))

    // Any of the 8 ORIGINAL views erroring = "schema unreachable" → bail to fixtures.
    // conversation_depth is deliberately EXCLUDED: it's a newer view, and if it
    // ever errors (not refreshed/granted) the other 8 should still render live.
    const anyError =
      outcome.error || conversion.error || knowledge.error || sender.error ||
      identity.error || funnel.error || device.error || heatmap.error
    if (anyError) {
      // eslint-disable-next-line no-console
      console.warn('[shredintel] Supabase live-fetch failed, falling back to fixtures', anyError)
      return null
    }
    if (depth.error) {
      // eslint-disable-next-line no-console
      console.warn('[shredintel] conversation_depth unavailable (non-fatal)', depth.error)
    }

    return {
      outcomeTimeline: outcome.data ?? [],
      conversionPulse: conversion.data ?? [],
      knowledgeSourceLeaderboard: knowledge.data ?? [],
      senderMixStack: sender.data ?? [],
      guestIdentitySplit: identity.data ?? [],
      leadCaptureFunnel: funnel.data ?? [],
      deviceExperienceMix: device.data ?? [],
      demandHeatmap: heatmap.data ?? [],
      conversationDepth: depth.error ? [] : (depth.data ?? []),
      // intel_* are newer enrichment views — non-fatal like conversation_depth
      intelSection: iSection.error ? [] : (iSection.data ?? []),
      intelPinchpoint: iPinch.error ? [] : (iPinch.data ?? []),
      intelSentiment: iSent.error ? [] : (iSent.data ?? []),
      intelHandover: iHand.error ? [] : (iHand.data ?? []),
      // page-funnel views — newest; non-fatal (empty → no funnel card / filter)
      pageFunnel: pFunnel.error ? [] : (pFunnel.data ?? []),
      pageSection: pSection.error ? [] : (pSection.data ?? []),
      pagePinchpoint: pPinch.error ? [] : (pPinch.data ?? []),
      pageSentiment: pSent.error ? [] : (pSent.data ?? []),
      // geo views — newest; non-fatal (empty → no Guest locations card)
      geoCountry: gCountry.error ? [] : (gCountry.data ?? []),
      geoCity: gCity.error ? [] : (gCity.data ?? []),
      // active_users RPC — non-fatal; null falls back to no Users tile
      activeUsers: users.error || users.data == null ? null : Number(users.data),
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[shredintel] Supabase live-fetch threw', err)
    return null
  }
}

/**
 * Compute (from, to) ISO dates for a period selector. The upper bound is
 * always "yesterday UTC" (the ETL runs nightly, today's rollup isn't in yet).
 */
export function periodDates(period: '7d' | '30d' | '90d' | '180d' | 'all'):
  { from: string; to: string } {
  const to = new Date()
  to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to)
  if (period === '7d')       from.setUTCDate(from.getUTCDate() - 6)
  else if (period === '30d') from.setUTCDate(from.getUTCDate() - 29)
  else if (period === '90d') from.setUTCDate(from.getUTCDate() - 89)
  else if (period === '180d') from.setUTCDate(from.getUTCDate() - 179)
  else                        from.setUTCDate(from.getUTCDate() - 730) // 'all' = 2 years window (safe upper bound)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}
