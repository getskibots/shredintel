/**
 * Shared fixed-grounding fragments used by BOTH the text pipeline (prompts.ts)
 * and voice (voices.ts) — single source, no copy drift. These are CODE (fixed
 * guarantees the prompt only restates), distinct from the editable master/slave
 * prompt layers in Supabase.
 */

/**
 * The universal drill contract: the SQL naming rule that makes every chart datum
 * map 1:1 onto a drill payload, so the manager can click any bar to open the
 * exact conversations behind it. Enforced end-to-end by src/lib/drill.ts +
 * ConversationExplorer reading these same column names.
 */
export const DRILL_CONTRACT =
  'DRILL CONTRACT: whenever a query GROUPs BY one of these dimensions, SELECT the column under its EXACT name — never alias it: section, pinchpoint, sentiment, funnel_stage, topic, day. Measures may be aliased freely (count(*) AS conversations, etc.). This is what lets the manager click a chart bar and read the exact conversations behind it.'

/**
 * The topic-zoom ladder: how to descend from an aggregate chart to a single
 * transcript, and how to treat the high-cardinality free-text `topic` column.
 */
export const TOPIC_LADDER =
  'GRANULARITY LADDER: knowledge section (chart) → the ranked TOPICS within it (GROUP BY topic on report.intel_topics or report.page_topics, ORDER BY count DESC LIMIT 12, and merge near-duplicate wordings) → the conversations behind one topic → a single transcript. `topic` is short free-text and HIGH-cardinality: only chart it once already ranked + limited; never put raw topic on an axis unranked.'

/**
 * Date awareness: how the analyst scopes time and how it must communicate it.
 * The manager's dashboard picker is the DEFAULT window; a question naming its own
 * dates overrides it for THAT answer only — the dashboard never moves. Every
 * time-scoped answer must state the window it used, in plain resort-local terms
 * (this is how a human analyst avoids confusion; on voice it must be spoken).
 * Callers pass the resort's timezone + today's local date so relative dates
 * ("last weekend", "this season", "yesterday") resolve correctly.
 */
export const DATE_AWARENESS =
  "DATE AWARENESS: the manager's picker window is the DEFAULT scope. If the question names its own dates or period (a day, a range, \"last December\", \"last weekend\", \"yesterday\", \"this season\"), resolve them in the resort's local timezone (relative to today's local date given above) and scope THIS answer to them instead — the picker/dashboard does NOT change. ALWAYS lead your answer by naming the window you used, in plain terms (e.g. \"For Dec 20–27 …\", \"Over your last 7 days …\"); on voice, say it out loud. Never give a time-scoped number without saying which window it covers. For time-of-day / day-of-week questions use report.conversation_time (hour_local 0-23, dow, day_local) in the resort's local time."
