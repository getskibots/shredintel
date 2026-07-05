/**
 * The universal drill contract — ONE payload shape for "show me exactly these
 * conversations", shared by every chart (AI-authored or hand-built) and by
 * ConversationExplorer.
 *
 * A chart datum maps 1:1 onto this because the SQL grounding SELECTs each
 * contract dimension under its EXACT name (no aliases), so `datum[dim]` is the
 * filter value. Click any mark → payloadFromDatum(datum, ctx) → explorer.
 */

/** Contract dimensions a datum can carry, in drill precedence order. */
export const DRILL_DIMENSIONS = ['section', 'pinchpoint', 'sentiment', 'funnel_stage', 'topic', 'day'] as const
export type DrillDimension = (typeof DRILL_DIMENSIONS)[number]

export interface DrillPayload {
  botId: number
  from?: string
  to?: string
  section?: string
  pinchpoint?: string
  sentiment?: string
  funnel_stage?: string
  topic?: string
  day?: string
}

/** Human-readable labels for axis titles, captions, and drill headers. */
export const FIELD_LABELS: Record<string, string> = {
  section: 'Knowledge section',
  pinchpoint: 'Conversion blocker',
  sentiment: 'Sentiment',
  funnel_stage: 'Funnel stage',
  topic: 'Topic',
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
