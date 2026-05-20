import type { KnowledgeGap } from '../../types/analytics'

export interface KnowledgeGapsProps {
  gaps: KnowledgeGap[]
  /** Bot's overall knowledge-gap rate (0-1) — bot answered without a KB source */
  gapRate?: number
  /** Optional copy overrides — e.g. for voice channel */
  eyebrow?: string
  title?: string
  description?: string
  rateLabel?: string
  hideRate?: boolean
  ctaLabel?: string
}

function timeAgo(iso?: string) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const hr = Math.floor(ms / 3_600_000)
  if (hr < 1) return 'just now'
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function KnowledgeGaps({
  gaps,
  gapRate = 0.65,
  eyebrow,
  title = 'Knowledge gaps',
  description,
  rateLabel = 'Knowledge-gap rate',
  hideRate = false,
  ctaLabel = 'Add to KB →',
}: KnowledgeGapsProps) {
  const totalOccurrences = gaps.reduce((s, g) => s + g.occurrences, 0)

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
      aria-label="Top knowledge gaps"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-botscrew-500">
              {eyebrow}
            </div>
          )}
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            {description ?? (
              <>
                Frequent questions the bot answered{' '}
                <span className="font-semibold text-danger">without a knowledge source</span>.
                Add these to your KB to convert guesses into answers.
              </>
            )}
          </p>
        </div>
        {!hideRate && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-danger">
              {rateLabel}
            </div>
            <div className="font-display text-2xl font-semibold tabular-nums text-danger">
              {(gapRate * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </header>

      <ul className="mt-5 divide-y divide-slate-100">
        {gaps.map((g) => (
          <li
            key={g.question}
            className="group flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                “{g.question}”
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-semibold tabular-nums text-slate-700">
                  {g.occurrences.toLocaleString()}
                </span>{' '}
                occurrences · last seen {timeAgo(g.lastSeen)}
              </p>
            </div>
            <button
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition group-hover:border-glacier-500 group-hover:bg-glacier-50 group-hover:text-glacier-700"
              aria-label={`Add answer for: ${g.question}`}
            >
              {ctaLabel}
            </button>
          </li>
        ))}
      </ul>

      <footer className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Showing top {gaps.length} of an estimated{' '}
        <span className="font-semibold text-slate-700">
          {totalOccurrences.toLocaleString()}+
        </span>{' '}
        this period.
      </footer>
    </section>
  )
}
