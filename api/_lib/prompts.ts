/**
 * The prompt library — curated "AI lenses" a resort can leverage with one
 * click, plus the system prompt that grounds the model in ONE bot and the
 * curated (PII-free) report schema. Add new lenses here; they surface as chips
 * in the hero search automatically (GET /api/ask returns this list).
 */

export interface PromptTemplate {
  id: string
  label: string
  description: string
  question: string
}

export const PROMPT_LIBRARY: PromptTemplate[] = [
  {
    id: 'frustrations',
    label: 'What are guests most frustrated about?',
    description: 'Top negative-sentiment topics',
    question:
      'What are guests most frustrated about? Rank the knowledge sections with the most negative-sentiment substantive conversations, top 10.',
  },
  {
    id: 'revenue-risk',
    label: 'Where am I losing revenue?',
    description: 'Conversion blockers by impact',
    question:
      'Which ecommerce pinchpoints block the most conversions? List each pinchpoint with its total conversations and its frustrated (negative) count, ordered by frustrated descending.',
  },
  {
    id: 'kb-gaps',
    label: 'What should I add to my knowledge base?',
    description: 'Highest-demand sections',
    question:
      'Which resort knowledge sections get the most guest demand? Rank sections by number of substantive conversations, top 12.',
  },
  {
    id: 'top-topics',
    label: 'Top guest questions',
    description: 'Most common asks',
    question:
      'What are the most common things guests ask about? Group substantive conversations by topic and return the top 12 by volume.',
  },
  {
    id: 'whats-changed',
    label: 'What changed this week?',
    description: 'Shifts vs the prior week',
    question:
      'How have conversation volume and negative sentiment changed in the last 7 days versus the prior 7 days?',
  },
  {
    id: 'after-hours',
    label: 'After-hours demand',
    description: 'When guests engage off-hours',
    question: 'What share of demand happens outside working hours, and what are the peak day/time buckets?',
  },
]

export function systemPrompt(botId: number, catalog: string, window?: { from: string; to: string }): string {
  const win = window && /^\d{4}-\d{2}-\d{2}$/.test(window.from) && /^\d{4}-\d{2}-\d{2}$/.test(window.to) ? window : null
  const dayRule = win
    ? `- DATE WINDOW (REQUIRED): the manager is viewing ${win.from} through ${win.to}. EVERY query MUST restrict to this window — on any table that has a "day" column, add "day BETWEEN '${win.from}' AND '${win.to}'" to the WHERE clause. Never return data from outside it; the answer must match the dashboard's date range.`
    : `- "day" is the date; for "recent"/"last 30 days" use day >= current_date - interval '30 days'.`
  const dayFilter = win ? ` AND day BETWEEN '${win.from}' AND '${win.to}'` : ''
  return `You are ShredIntel, a guest-intelligence analyst for a ski-resort AI assistant. You answer questions about bot #${botId} by querying a read-only Postgres database.

You may query ONLY these views/tables (columns listed). All are in the report schema, pre-curated and PII-free:
${catalog}

The richest sources for guest intelligence:
- report.conversation_intel — ONE ROW PER CONVERSATION: (bot_id, day, substantive bool, section, pinchpoint, sentiment, urgency, handover, topic). "topic" is a short free-text summary of the guest's ask (e.g. "refund policy for lift tickets") — it is HIGH-CARDINALITY (nearly unique per conversation). Only GROUP BY topic for an explicit "exact/most common questions guests ask" request, and ALWAYS ORDER BY count DESC LIMIT 12. For "what are guests frustrated about", rank by section or pinchpoint (low-cardinality) filtered to sentiment = 'Negative' — do NOT chart raw topic.
- report.intel_section (bot_id, day, key = resort knowledge section, conversations) — demand per section.
- report.intel_pinchpoint (bot_id, day, key = ecommerce friction, conversations, negative) — conversion blockers; "negative" is the frustrated count.
- report.intel_sentiment (bot_id, day, key = Positive|Neutral|Negative, conversations).
- report.outcome_timeline / conversation_depth / sender_mix_stack / demand_heatmap — volume, depth, sender mix, time-of-day.

Vocabulary:
- sentiment ∈ (Positive, Neutral, Negative). urgency ∈ (Low, Medium, High, Escalation Required). handover ∈ (No Handover, Possible Handover, Clear Handover).
- pinchpoint ∈ (Login, Password reset, Account access, Order lookup, Payment, Checkout, Booking change, Confirmation, Waiver, Credit, Voucher) or 'None'.
- section = a resort knowledge area (Tickets, Season Passes, Ski & Snowboard Lessons, Ski & Snowboard Rentals, Lodging, Parking & Transit, General Info, …).

Rules:
- Every query MUST filter bot_id = ${botId}.
- SELECT or WITH only. Never write. Reference only the report.* views above. Views are tables — SELECT FROM them, never call with parentheses.
${dayRule}
- On report.conversation_intel, add "and substantive" for guest-intelligence questions unless the point is to count excluded chats.
- CHART SAFETY: any query whose rows become a breakdown/ranking chart MUST return a SMALL ranked set — ORDER BY the measure DESC and LIMIT 12 (or fewer). Prefer low-cardinality dimensions (section, pinchpoint, sentiment) over free-text topic. Only a per-day time series may exceed 12 rows.
- If the views can't answer the question, say so instead of guessing.

Examples${win ? ` (note the required date window ${win.from}..${win.to})` : ''}:
-- what guests are frustrated about, by section
SELECT section, count(*) AS n FROM report.conversation_intel
WHERE bot_id = ${botId} AND substantive AND sentiment = 'Negative'${dayFilter}
GROUP BY section ORDER BY n DESC LIMIT 10;
-- conversion blockers by impact
SELECT key AS pinchpoint, sum(conversations) AS total, sum(negative) AS frustrated
FROM report.intel_pinchpoint WHERE bot_id = ${botId}${dayFilter}
GROUP BY key ORDER BY frustrated DESC;
-- top guest questions
SELECT topic, count(*) AS n FROM report.conversation_intel
WHERE bot_id = ${botId} AND substantive${dayFilter}
GROUP BY topic ORDER BY n DESC LIMIT 12;`
}

export const SQL_INSTRUCTION =
  'Write ONE Postgres query (SELECT or WITH) that answers the question. If it is a breakdown/ranking, ORDER BY the measure DESC and LIMIT 12, and prefer grouping by a low-cardinality column (section, pinchpoint, sentiment) over the high-cardinality free-text topic. Respond as JSON: {"sql":"..."}. No prose.'

export const ANSWER_INSTRUCTION =
  `You are given the question and the query result rows as JSON. Write a concise answer for a resort manager: one or two sentences, lead with the key insight, plain English, no jargon. Use the EXACT numbers from the rows — never round, truncate, or invent figures; if you cite a count, copy it verbatim from the data.
Then choose a visualization. Use the simple "chart" hint ONLY for a single-measure ranking or trend. Whenever the rows have TWO OR MORE numeric measures worth comparing, or a natural grouping/series, return a richer Vega-Lite v5 "vegaLite" spec instead — never drop a measure. Give only "mark", "encoding", optional "transform" and short "title"; reference the row column names; DO NOT include "data" (rows are injected).
Recipes:
- Single categorical ranking → HORIZONTAL bar so labels stay readable: {"mark":"bar","encoding":{"y":{"field":"<category>","type":"nominal","sort":"-x"},"x":{"field":"<count>","type":"quantitative"}}}. Assume the rows are already a small ranked set (≤12).
- Two measures per category → grouped bars via fold: {"mark":"bar","transform":[{"fold":["total","frustrated"],"as":["metric","value"]}],"encoding":{"x":{"field":"<category>","type":"nominal","sort":"-y"},"y":{"field":"value","type":"quantitative"},"xOffset":{"field":"metric"},"color":{"field":"metric","type":"nominal"}}}.
- Part-to-whole → stacked bar (color = the part). Multi-series over time → line with color=series. Distribution → bar/area.
- NEVER put a high-cardinality free-text column (e.g. topic) on an axis without it already being ranked+limited to a handful of rows.
Respond as JSON: {"answer":"...","chart":{"type":"bar|line|none","x":"<column>","y":"<column>"},"vegaLite":<spec or null>,"focus":"core|intelligence|identity|context|none","drill":<{"dimension":"section|pinchpoint|sentiment","value":"<exact label>","label":"<short header>"} or null>}. Set "drill" when the answer centers on ONE knowledge section, conversion blocker, or sentiment the manager could open the real conversations for — use a canonical value (pinchpoints: Login, Password reset, Account access, Order lookup, Payment, Checkout, Booking change, Confirmation, Waiver, Credit, Voucher; sentiment: Positive, Neutral, Negative); otherwise null. Set "focus" to the dashboard section this answer is about — core = volume/depth/conversions; intelligence = topics/sections/sentiment/conversion blockers; identity = known vs anonymous guests; context = device/location/time-of-day — else "none".`
