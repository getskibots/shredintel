import { LineChart, Info } from 'lucide-react'
import type { GA4Summary } from '../../data/useGA4'

/**
 * Site-traffic card (Google Analytics) — the denominator ShredIntel never had.
 * Reframes the bot's own numbers against real site traffic: how many sessions the
 * site saw, and what share of them actually reached the bot ("reach"). Renders
 * ONLY when the bot has GA4 connected with data in range (summary != null), so a
 * non-GA4 bot's dashboard is unchanged.
 *
 * botSessions = the bot's own conversations in the same window (chats opened).
 * Reach = botSessions / GA4 sessions. Guarded: if the selected range reaches back
 * before GA4's coverage, GA4 sessions are undercounted and reach would exceed
 * 100% → we show "—" with a note instead of a misleading number.
 */
export function GA4TrafficCard({
  summary, botSessions, className = '',
}: { summary: GA4Summary; botSessions: number; className?: string }) {
  const { sessions, pageviews, sources } = summary
  const pagesPerSession = sessions > 0 ? pageviews / sessions : 0
  const reach = sessions > 0 ? botSessions / sessions : 0
  const reachValid = sessions > 0 && reach > 0 && reach <= 1

  const totalSourceSessions = sources.reduce((s, x) => s + x.sessions, 0) || 1
  const num = (n: number) => n.toLocaleString()

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-botscrew-50 text-botscrew-600">
            <LineChart className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Site traffic · Google Analytics</div>
            <div className="text-sm font-semibold text-slate-900">How much of your site reaches the bot</div>
          </div>
        </div>
        {(summary.fromDay && summary.toDay) && (
          <span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">
            GA4 · {fmtDay(summary.fromDay)}–{fmtDay(summary.toDay)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions" value={num(sessions)} sub="site visits" />
        <Stat label="Pageviews" value={num(pageviews)} sub={`${pagesPerSession.toFixed(1)} per session`} />
        <Stat
          label="Bot reach"
          value={reachValid ? `${(reach * 100).toFixed(1)}%` : '—'}
          sub={reachValid ? 'sessions that opened the bot' : 'range exceeds GA4 window'}
          highlight={reachValid}
        />
        <Stat label="Bot chats" value={num(botSessions)} sub="opened in this window" />
      </div>

      {sources.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Top traffic sources</div>
          <div className="space-y-1.5">
            {sources.map((s) => {
              const pct = (s.sessions / totalSourceSessions) * 100
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-xs text-slate-600" title={s.source}>{s.source}</div>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className="absolute inset-y-0 left-0 rounded bg-botscrew-500/80" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-slate-500">{num(s.sessions)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!reachValid && sessions > 0 && (
        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-slate-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          GA4 covers roughly the last 90 days. Pick a shorter range (e.g. Last 30 days) to see bot reach.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-botscrew-200 bg-botscrew-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${highlight ? 'text-botscrew-700' : 'text-slate-900'}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  )
}

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
