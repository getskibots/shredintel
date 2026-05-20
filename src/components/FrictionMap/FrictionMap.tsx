import type { FrictionPage } from '../../types/analytics'

export interface FrictionMapProps {
  pages: FrictionPage[]
  /** Max bars to render (top N) */
  limit?: number
}

function fmtPath(path: string) {
  // Trim leading slash, collapse "shop/" prefix to "🛒" feel
  return path.startsWith('/') ? path.slice(1) || '(home)' : path
}

export function FrictionMap({ pages, limit = 12 }: FrictionMapProps) {
  const sorted = [...pages].sort((a, b) => b.conversations - a.conversations).slice(0, limit)
  const max = sorted[0]?.conversations ?? 1
  const checkoutTotal = sorted
    .filter((p) => p.isCheckoutFlow)
    .reduce((sum, p) => sum + p.conversations, 0)

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
      aria-label="Top pages driving chat volume"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Where guests get stuck
          </h3>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Pages driving the most chat volume. Checkout-flow pages are{' '}
            <span className="font-semibold text-glacier-600">conversion-critical</span>
            {' '}— every unanswered question here is a lost sale.
          </p>
        </div>
        <div className="rounded-lg bg-glacier-50 px-3 py-2 text-right">
          <div className="text-[11px] font-medium uppercase tracking-wider text-glacier-700">
            Checkout-flow chats
          </div>
          <div className="font-display text-2xl font-semibold tabular-nums text-glacier-700">
            {checkoutTotal.toLocaleString()}
          </div>
        </div>
      </header>

      <ul className="mt-6 space-y-2.5">
        {sorted.map((p) => {
          const w = (p.conversations / max) * 100
          return (
            <li
              key={p.path}
              className="grid grid-cols-[1fr_3fr_auto] items-center gap-3 sm:grid-cols-[16rem_1fr_auto]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className={[
                    'h-2 w-2 shrink-0 rounded-full',
                    p.isCheckoutFlow ? 'bg-glacier-500' : 'bg-slate-300',
                  ].join(' ')}
                />
                <span
                  className={[
                    'truncate font-mono text-xs',
                    p.isCheckoutFlow ? 'text-glacier-700 font-semibold' : 'text-slate-700',
                  ].join(' ')}
                  title={p.path}
                >
                  {fmtPath(p.path)}
                </span>
              </div>
              <div className="relative h-6 overflow-hidden rounded-md bg-slate-100">
                <div
                  className={[
                    'absolute left-0 top-0 h-full rounded-md transition-all',
                    p.isCheckoutFlow
                      ? 'bg-gradient-to-r from-glacier-500 to-glacier-400'
                      : 'bg-slate-300',
                  ].join(' ')}
                  style={{ width: `${w}%` }}
                />
              </div>
              <div className="text-right text-sm font-semibold tabular-nums text-slate-700">
                {p.conversations.toLocaleString()}
              </div>
            </li>
          )
        })}
      </ul>

      <footer className="mt-5 flex items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-glacier-500" />
          Checkout / order flow
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          Informational
        </span>
      </footer>
    </section>
  )
}
