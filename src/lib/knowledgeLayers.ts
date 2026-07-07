/**
 * Canonical Knowledge Layer taxonomy — the resort-facing answer sources that
 * mirror the BotsCrew admin layers + the ETL bucketing in
 * report.knowledge_layer_mix (TEXT→Text Edits, WEBSITE→Website, FILE→Files,
 * null→Instructions, is_failed→Failed).
 *
 * Single source of truth for order + colors, so the Knowledge card and the
 * drill-transcript badge can never drift apart.
 */
export const KNOWLEDGE_LAYERS: string[] = ['Text Edits', 'Website', 'Files', 'Instructions', 'Failed']

/** Grounded = answered from a retrieved source (vs. prompt-only / failed). */
export const GROUNDED_LAYERS = new Set<string>(['Text Edits', 'Website', 'Files'])

/** Solid color per layer — charts, legend dots, mix bars. */
export const LAYER_COLOR: Record<string, string> = {
  'Text Edits': '#1D9E75', // teal — curated Q&A
  Website: '#2182BF', // brand blue — crawled pages
  Files: '#EF9F27', // amber — uploaded docs
  Instructions: '#7F77DD', // purple — prompt-only (no retrieved source)
  Failed: '#DC5B3B', // coral — couldn't answer
}

/** Tailwind pill classes per layer — the per-message badge in the drill. */
export const LAYER_BADGE: Record<string, { bg: string; text: string }> = {
  'Text Edits': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Website: { bg: 'bg-sky-50', text: 'text-sky-700' },
  Files: { bg: 'bg-amber-50', text: 'text-amber-700' },
  Instructions: { bg: 'bg-violet-50', text: 'text-violet-700' },
  Failed: { bg: 'bg-rose-50', text: 'text-rose-700' },
}
