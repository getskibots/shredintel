/**
 * FREERIDE — the semantic cube catalog.
 *
 * One declarative source of truth for the dimensions (the "faces" you can spin
 * onto an axis) and the measures (what you compute on a face). BOTH the query
 * engine and the AI action-loop read from here, so a slice is always a valid,
 * bounded combination of {dimension(s), measure, filters, grain} — never
 * free-form SQL.
 *
 * Grain of the fact table = one substantive conversation.
 *   Chat  -> report.conversation_time  (the wide fact spine)
 *   Voice -> report.call_base           (parallel voice fact)
 *
 * The whole cube reads from one table: conversation_time was extended to carry
 * category, resolution, revenue, language, and flavor, so all 21 faces are live.
 */

export const CUBE_FACT = { chat: 'conversation_time', voice: 'call_base' } as const

export type DimGroup = 'quality' | 'journey' | 'place' | 'time'
export type Grain = 'hour' | 'day' | 'dow' | 'week' | 'month'
export type MeasureFormat = 'int' | 'pct' | 'sec'

export interface Dimension {
  key: string            // stable id used in actions + URLs (e.g. "sentiment")
  label: string          // human label shown on axes + chips
  column: string         // SQL column on the fact table
  group: DimGroup        // for grouping in the picker
  order?: string[]       // fixed display order for ordinal/categorical faces
  grain?: Grain          // for time faces
  desc: string           // one line of AI grounding
  pending?: boolean      // true until the fact-table extension adds the column
}

export interface Measure {
  key: string
  label: string
  expr: string           // SQL aggregate over the fact table
  format: MeasureFormat
  desc: string
  pending?: boolean      // depends on a pending dimension column
}

// ── Dimensions (the faces) ────────────────────────────────────────────────
export const DIMENSIONS: Dimension[] = [
  // Quality — the AI enrichment
  { key: 'category',   label: 'Category',       column: 'category',    group: 'quality', desc: '12 universal intent buckets (Pricing & Availability, Booking, Refunds, Human / Escalation, ...).' },
  { key: 'section',    label: 'Section',        column: 'section',     group: 'quality', desc: 'Per-vertical knowledge topic the question maps to (e.g. Lift Tickets, Lodging).' },
  { key: 'topic',      label: 'Topic',          column: 'topic',       group: 'quality', desc: 'Short specific topic of the conversation (high cardinality — best zoomed into, not charted whole).' },
  { key: 'sentiment',  label: 'Sentiment',      column: 'sentiment',   group: 'quality', order: ['Positive', 'Neutral', 'Negative'], desc: 'Guest sentiment: Positive, Neutral, Negative.' },
  { key: 'urgency',    label: 'Urgency',        column: 'urgency',     group: 'quality', order: ['Low', 'Medium', 'High', 'Escalation Required'], desc: 'How pressing the guest need is. (Escalation Required is effectively unused.)' },
  { key: 'resolution', label: 'Resolution',     column: 'resolution',  group: 'quality', order: ['Resolved', 'Partial', 'Unresolved', 'N/A'], desc: 'Did the BOT answer the question (judged from the answer, not guest silence).' },
  { key: 'revenue',    label: 'Revenue signal', column: 'revenue',     group: 'quality', order: ['Ready to Book', 'Browsing', 'None', 'At Risk'], desc: 'Commercial intent: Ready to Book, Browsing, None, or At Risk (buying intent + an in-transcript blocker).' },
  { key: 'handover',   label: 'Handover',       column: 'handover',    group: 'quality', order: ['No Handover', 'Possible Handover', 'Clear Handover', 'Escalation Required'], desc: 'Whether the guest wanted or needed a human.' },
  { key: 'pinchpoint', label: 'Pinch point',    column: 'pinchpoint',  group: 'quality', desc: '12 universal friction points (Pricing, Availability, Policy, Technical, ...).' },
  { key: 'language',   label: 'Language',       column: 'language',    group: 'quality', desc: 'Detected conversation language.' },
  { key: 'flavor',     label: 'Flavor',         column: 'flavor',      group: 'quality', desc: 'GSB-internal easter-egg tone tag (funny, furious, wholesome, ...). Not for the partner embed.' },

  // Journey — where on the site / how far down the funnel
  { key: 'funnel_stage', label: 'Funnel stage', column: 'funnel_stage', group: 'journey', order: ['Home', 'Browse & content', 'Product & shop', 'Cart', 'Checkout', 'Confirmation', 'Account & orders'], desc: 'Ecommerce funnel stage the question originated on.' },
  { key: 'page',       label: 'Page',           column: 'page_path',   group: 'journey', desc: 'Resort site page the conversation started on (high cardinality).' },

  // Place — where the guest is
  { key: 'country',    label: 'Country',        column: 'country_name', group: 'place', desc: 'Guest country from IP at session start.' },
  { key: 'region',     label: 'Region',         column: 'region',      group: 'place', desc: 'Guest region / state.' },
  { key: 'city',       label: 'City',           column: 'city',        group: 'place', desc: 'Guest city (high cardinality).' },

  // Time — resort-LOCAL time faces
  { key: 'day',        label: 'Day',            column: 'day_local',   group: 'time', grain: 'day', desc: 'Calendar day in the resort timezone.' },
  { key: 'hour',       label: 'Hour of day',    column: 'hour_local',  group: 'time', grain: 'hour', desc: 'Local hour 0-23 — for staffing + demand curves.' },
  { key: 'dow',        label: 'Day of week',    column: 'dow',         group: 'time', grain: 'dow', order: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], desc: 'Weekday name — weekend vs weekday patterns.' },
  { key: 'week',       label: 'Week',           column: 'iso_week',    group: 'time', grain: 'week', desc: 'ISO week number.' },
  { key: 'month',      label: 'Month',          column: 'month_local', group: 'time', grain: 'month', desc: 'Local month 1-12 — seasonality.' },
]

// ── Measures (what you compute on a face) ─────────────────────────────────
// "share" is derived at render time (a measure value / the slice total), so it
// is not an SQL aggregate here.
export const MEASURES: Measure[] = [
  { key: 'conversations',      label: 'Conversations',       expr: 'count(*)',                                                                    format: 'int', desc: 'Count of substantive conversations. The default measure.' },
  { key: 'negative_rate',      label: 'Negative %',          expr: `avg((sentiment = 'Negative')::int)`,                                          format: 'pct', desc: 'Share with negative sentiment — friction.' },
  { key: 'high_urgency_rate',  label: 'High urgency %',      expr: `avg((urgency IN ('High','Escalation Required'))::int)`,                       format: 'pct', desc: 'Share flagged High urgency — needs attention.' },
  { key: 'handover_rate',      label: 'Handover %',          expr: `avg((handover IN ('Possible Handover','Clear Handover','Escalation Required'))::int)`, format: 'pct', desc: 'Share where the guest wanted or needed a human.' },
  { key: 'resolved_rate',      label: 'Resolved %',          expr: `avg((resolution = 'Resolved')::int)`,                                         format: 'pct', desc: 'Share the bot fully answered.' },
  { key: 'unresolved_rate',    label: 'Unresolved %',        expr: `avg((resolution = 'Unresolved')::int)`,                                       format: 'pct', desc: 'Share the bot could not answer — content gaps.' },
  { key: 'at_risk_rate',       label: 'Revenue at risk %',   expr: `avg((revenue = 'At Risk')::int)`,                                             format: 'pct', desc: 'Share showing buying intent + an unresolved blocker.' },
  { key: 'ready_to_book_rate', label: 'Ready to book %',     expr: `avg((revenue = 'Ready to Book')::int)`,                                       format: 'pct', desc: 'Share showing clear intent to purchase.' },
  { key: 'avg_duration',       label: 'Avg duration (sec)',  expr: 'avg(duration_sec)',                                                           format: 'sec', desc: 'Average conversation length in seconds.' },
]

// ── Lookups ───────────────────────────────────────────────────────────────
export const DIM_BY_KEY: Record<string, Dimension> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]))
export const MEASURE_BY_KEY: Record<string, Measure> = Object.fromEntries(MEASURES.map((m) => [m.key, m]))

export const dimByKey = (key: string): Dimension | undefined => DIM_BY_KEY[key]
export const measureByKey = (key: string): Measure | undefined => MEASURE_BY_KEY[key]

/** Faces + measures that are live right now (fact-table extension not yet applied). */
export const liveDimensions = (): Dimension[] => DIMENSIONS.filter((d) => !d.pending)
export const liveMeasures = (): Measure[] => MEASURES.filter((m) => !m.pending)

/**
 * Compact catalog listing for the slice-picking prompt. The AI reads this and
 * returns catalog KEYS (never SQL), so its whole vocabulary is exactly this.
 */
export function cubeGrounding(): string {
  const dimLine = (d: Dimension) =>
    `  ${d.key} — ${d.desc}${d.order ? ` [values: ${d.order.join(', ')}]` : ''}`
  const measLine = (m: Measure) => `  ${m.key} — ${m.desc}`
  return [
    'DIMENSIONS (the faces — put 1 or 2 keys in `dims`; any key may also be a filter):',
    ...DIMENSIONS.map(dimLine),
    '',
    'MEASURES (pick exactly one key for `measure`):',
    ...MEASURES.map(measLine),
  ].join('\n')
}
