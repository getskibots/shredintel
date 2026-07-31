import { Target } from 'lucide-react'
import type { GA4PageOpp } from '../../data/useGA4'

/**
 * Page opportunity (Google Analytics) — the real payoff of the GA4 overlay.
 * Ranks the site's busiest pages by actual traffic and shows how far the bot
 * reaches on each. High traffic + near-zero reach = the pages where surfacing
 * the bot would move the needle most (the bot-only funnel can't see these,
 * because pages with lots of traffic but no bot chats never appear in it).
 *
 * Renders only when GA4 is connected with page data (pages.length > 0).
 */
export function GA4PageOpportunity({ pages, className = '' }: { pages: GA4PageOpp[]; className?: string }) {
  if (!pages.length) return null
  const maxPv = Math.max(...pages.map((p) => p.pageviews), 1)
  const num = (n: number) => n.toLocaleString()
  const top = pages[0]

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-botscrew-50 text-botscrew-600">
          <Target className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Page opportunity · Google Analytics</div>
          <div className="text-sm font-semibold text-slate-900">Your busiest pages, and how far the bot reaches each</div>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Ranked by real site traffic. A high-traffic page with low <span className="font-medium text-slate-700">reach</span> is where putting the bot in front of visitors pays off most.
        {top && <> Your busiest page drew <span className="font-medium text-slate-700">{num(top.pageviews)}</span> views{top.reach_pct != null && <> at <span className="font-medium text-slate-700">{fmtReach(top.reach_pct)}</span> reach</>}.</>}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="py-1.5 pr-2 text-left font-semibold">Page</th>
              <th className="py-1.5 px-2 text-right font-semibold">Pageviews</th>
              <th className="py-1.5 px-2 text-right font-semibold">Bot chats</th>
              <th className="py-1.5 pl-2 text-right font-semibold">Reach</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => {
              const pct = (p.pageviews / maxPv) * 100
              return (
                <tr key={p.page_path} className="border-b border-slate-50 last:border-0">
                  <td className="max-w-[240px] truncate py-2 pr-2 text-xs text-slate-700" title={p.page_path}>{cleanPath(p.page_path)}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="relative hidden h-2.5 w-20 overflow-hidden rounded bg-slate-100 sm:block">
                        <div className="absolute inset-y-0 left-0 rounded bg-botscrew-500/70" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums text-slate-700">{num(p.pageviews)}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-500">{p.conversations || '—'}</td>
                  <td className="py-2 pl-2 text-right">
                    <ReachBadge pct={p.reach_pct} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Low reach on a high-traffic page = the opportunity, so red reads as "act here". */
function ReachBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-slate-300">—</span>
  const tone = pct < 1 ? 'bg-rose-50 text-rose-600' : pct < 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>{fmtReach(pct)}</span>
}

function fmtReach(pct: number): string {
  if (pct === 0) return '0%'
  if (pct < 0.1) return '<0.1%'
  return `${pct.toFixed(1)}%`
}

/** Drop the leading host so the path reads cleanly (getskitickets.com/foo → /foo). */
function cleanPath(full: string): string {
  const i = full.indexOf('/')
  return i >= 0 ? full.slice(i) || '/' : full
}
