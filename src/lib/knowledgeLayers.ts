/**
 * Canonical Knowledge Layer taxonomy — the resort-facing answer sources that
 * mirror the BotsCrew admin layers + the ETL bucketing in
 * report.knowledge_layer_mix (TEXT→Text Edits, WEBSITE→Website, FILE→Files,
 * null→Instructions, is_failed→Failed) PLUS Live data — replies produced by an
 * AI-action atom (get_snow_report / lift status / weather…), which never create
 * a knowledge_reply row and so were previously invisible in the mix.
 *
 * Single source of truth for order + colors, so the Knowledge card and the
 * drill-transcript badge can never drift apart.
 */
export const KNOWLEDGE_LAYERS: string[] = ['Text Edits', 'Website', 'Files', 'Live data', 'Instructions', 'Failed']

/** Grounded = answered from a real source (retrieved content OR live data),
 *  vs. prompt-only / failed. Live data counts: it's the bot answering from a
 *  real-time feed, not guessing from the prompt. */
export const GROUNDED_LAYERS = new Set<string>(['Text Edits', 'Website', 'Files', 'Live data'])

/** Solid color per layer — charts, legend dots, mix bars. */
export const LAYER_COLOR: Record<string, string> = {
  'Text Edits': '#1D9E75', // teal — curated Q&A
  Website: '#2182BF', // brand blue — crawled pages
  Files: '#EF9F27', // amber — uploaded docs
  'Live data': '#06B6D4', // cyan — realtime action feeds (snow report, lift status)
  Instructions: '#7F77DD', // purple — prompt-only (no retrieved source)
  Failed: '#DC5B3B', // coral — couldn't answer
}

/** Tailwind pill classes per layer — the per-message badge in the drill. */
export const LAYER_BADGE: Record<string, { bg: string; text: string }> = {
  'Text Edits': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Website: { bg: 'bg-sky-50', text: 'text-sky-700' },
  Files: { bg: 'bg-amber-50', text: 'text-amber-700' },
  'Live data': { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  Instructions: { bg: 'bg-violet-50', text: 'text-violet-700' },
  Failed: { bg: 'bg-rose-50', text: 'text-rose-700' },
}
