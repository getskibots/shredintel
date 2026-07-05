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
