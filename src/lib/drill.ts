/**
 * The universal drill contract — ONE payload shape for "show me exactly these
 * conversations", shared by every chart (AI-authored or hand-built) and by
 * ConversationExplorer.
 *
 * A chart datum maps 1:1 onto this because the SQL grounding SELECTs each
 * contract dimension under its EXACT name (no aliases), so `datum[dim]` is the
 * filter value. Click any mark → payloadFromDatum(datum, ctx) → explorer.
 */

/** Contract dimensions a datum can carry, in drill precedence order.
 *  `handover` + `hour_local` are voice-relevant (backed by report.call_base);
 *  `city` doubles as the caller city for voice. */
export const DRILL_DIMENSIONS = ['section', 'layer', 'pinchpoint', 'sentiment', 'urgency', 'funnel_stage', 'topic', 'handover', 'transferred', 'voicemail', 'user_id', 'city', 'hour_local', 'dow', 'day'] as const
export type DrillDimension = (typeof DRILL_DIMENSIONS)[number]

export interface DrillPayload {
  botId: number
  from?: string
  to?: string
  section?: string
  /** Knowledge layer 'Website'|'Text Edits'|'Files'|'Instructions'|'Failed'
   *  (the "Where answers come from" bar → conversations that used that source). */
  layer?: string
  pinchpoint?: string
  sentiment?: string
  urgency?: string
  funnel_stage?: string
  topic?: string
  handover?: string
  /** Voice escalation, Twilio ground truth: 'Escalated' (a real transfer) |
   *  'AI resolved' (no transfer). Mapped to a boolean filter in the explorer. */
  transferred?: string
  /** Voice escalation reach, from the handover transcript: 'Voicemail' |
   *  'Reached a person'. Mapped to is_voicemail (+ transferred) in the explorer. */
  voicemail?: string
  /** Voice: one caller (admin_user id, the phone identity) — all their calls. */
  user_id?: string
  city?: string
  hour_local?: string
  /** Resort-local day of week 'Mon'..'Sun' (chat demand rhythm). */
  dow?: string
  /** Compound time filter from the demand donut: 'working' (Mon–Fri 9 AM–6 PM)
   *  vs 'after' (everything else). Set explicitly by the donut click, not a
   *  chart-datum dimension. */
  coverage?: 'working' | 'after'
  day?: string
}

/** Human-readable labels for axis titles, captions, and drill headers. */
export const FIELD_LABELS: Record<string, string> = {
  section: 'Knowledge section',
  layer: 'Knowledge layer',
  pinchpoint: 'Conversion blocker',
  sentiment: 'Sentiment',
  urgency: 'Urgency',
  funnel_stage: 'Funnel stage',
  topic: 'Topic',
  handover: 'Handover need',
  transferred: 'Escalation',
  voicemail: 'Escalation outcome',
  user_id: 'Caller',
  city: 'City',
  hour_local: 'Hour of day',
  dow: 'Day of week',
  coverage: 'When',
  day: 'Day',
  conversations: 'Conversations',
  negative: 'Frustrated',
  frustrated: 'Frustrated',
  total: 'Total',
  n: 'Conversations',
  count: 'Count',
}

/** Field name → a human label (dictionary first, else Title Case the snake_case). */
export function humanLabel(field: string): string {
  return (
    FIELD_LABELS[field] ||
    field.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
  )
}

/** A short header for a drill payload (the most specific dimension it carries). */
export function drillHeader(p: DrillPayload): string {
  for (const dim of DRILL_DIMENSIONS) {
    const v = p[dim]
    if (v) return `${humanLabel(dim)}: ${v}`
  }
  return 'Conversations'
}

/**
 * Build a drill payload from a clicked chart datum + the request's bot/window.
 * Reads only contract dimensions present on the datum; returns null if none
 * (so non-drillable marks — e.g. a pure time axis — don't open an empty modal).
 */
export function payloadFromDatum(
  datum: Record<string, unknown> | null | undefined,
  ctx: { botId: number; from?: string; to?: string },
): DrillPayload | null {
  if (!datum) return null
  const p: DrillPayload = { botId: ctx.botId, from: ctx.from, to: ctx.to }
  let hit = false
  for (const dim of DRILL_DIMENSIONS) {
    const v = datum[dim]
    if (v != null && String(v).trim() && String(v) !== 'Other') {
      p[dim] = String(v).trim()
      hit = true
    }
  }
  return hit ? p : null
}
