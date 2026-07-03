/**
 * The prompt library — curated "AI lenses" a resort can leverage with one
 * click, plus the system prompt that grounds the model in ONE bot and the
 * curated (PII-free) report schema. Add new lenses here; they surface as chips
 * in the Ask bar automatically (GET /api/ask returns this list).
 */

export interface PromptTemplate {
  id: string
  label: string
  description: string
  question: string
}

export const PROMPT_LIBRARY: PromptTemplate[] = [
  {
    id: 'top-topics',
    label: 'Top guest topics',
    description: 'What guests ask about most',
    question: 'What are the most common topics guests ask about? Rank the top 10 by volume.',
  },
  {
    id: 'knowledge-gaps',
    label: 'Biggest knowledge gaps',
    description: 'Where the bot fails to answer',
    question: 'Where is the bot failing to answer guests? Show the biggest knowledge gaps.',
  },
  {
    id: 'whats-changed',
    label: 'What changed',
    description: 'Shifts vs the prior period',
    question: 'How have conversation volume and resolution changed in the last 30 days versus the prior 30 days?',
  },
  {
    id: 'after-hours',
    label: 'After-hours demand',
    description: 'When guests engage off-hours',
    question: 'What share of demand happens outside working hours, and what are the peak times?',
  },
  {
    id: 'performance',
    label: 'Engagement & resolution',
    description: 'How well the bot performs',
    question: 'What are the engagement and resolution rates, and how are they trending over time?',
  },
]

export function systemPrompt(botId: number, catalog: string): string {
  return `You are ShredIntel, an analytics assistant for a ski-resort AI assistant. You answer questions about bot #${botId} by querying a read-only Postgres database.

You may query ONLY these views. Each is a plain VIEW/table with the listed columns — NOT a function. They are pre-aggregated per bot per day and contain NO personal data:
${catalog}

How to query:
- Each view is a table: SELECT FROM it with a WHERE clause. NEVER call a view like a function with parentheses — write "FROM report.knowledge_source_leaderboard WHERE bot_id = ${botId}", never "FROM report.knowledge_source_leaderboard(${botId}, ...)".
- Every query MUST filter to bot_id = ${botId}.
- SELECT or WITH only. Never write. Reference only the report.* views above.
- The "day" column holds the date; for "recent"/"last 30 days" use day >= current_date - interval '30 days'.
- In knowledge_source_leaderboard, source_name '(none)' and '(no source)' both mean no source matched — exclude BOTH (and NULL) when ranking guest topics.
- If the views can't answer the question, say so instead of guessing.

Example — top guest topics:
SELECT source_name, sum(bot_message_count) AS n
FROM report.knowledge_source_leaderboard
WHERE bot_id = ${botId} AND source_name NOT IN ('(none)', '(no source)') AND source_name IS NOT NULL
GROUP BY source_name ORDER BY n DESC LIMIT 10;`
}

export const SQL_INSTRUCTION =
  'Write ONE Postgres query (SELECT or WITH) that answers the question. Respond as JSON: {"sql":"..."}. No prose.'

export const ANSWER_INSTRUCTION =
  'You are given the question and the query result rows as JSON. Write a concise answer for a resort manager: one or two sentences, lead with the key insight, plain English, no jargon. Use the EXACT numbers from the rows — never round, truncate, or invent figures; if you cite a count, copy it verbatim from the data. Then pick the single best chart for the data. Respond as JSON: {"answer":"...","chart":{"type":"bar|line|none","x":"<column>","y":"<column>"}}.'
