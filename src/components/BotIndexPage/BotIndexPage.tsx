import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, TrendingUp, Headphones } from 'lucide-react'
import { useAvailableBots } from '../../data/useAnalytics'

/**
 * Landing page at "/" — a searchable directory of every available bot.
 * Click a bot to open its analytics. Replaces the old "/ → /bot/43" redirect.
 */
export function BotIndexPage() {
  const { bots, isLive, isLoading } = useAvailableBots()
  const location = useLocation()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return bots
    return bots.filter(
      (b) => b.label.toLowerCase().includes(q) || String(b.botId).includes(q),
    )
  }, [bots, query])

  // Voice bots route to /voice; everything else to /bot/:id. Preserve any
  // ?period / ?embed params so the selection carries through.
  const hrefFor = (route: string) =>
    `${route}${location.search}`

  const isVoice = (route: string) => route.startsWith('/voice')

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Choose a bot
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isLoading
              ? 'Loading bots…'
              : `${bots.length} bot${bots.length === 1 ? '' : 's'} available`}
            {isLive ? ' · live' : ' · demo'}
          </p>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or id…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          {isLoading ? 'Loading…' : `No bots match “${query}”.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <Link
              key={b.botId}
              to={hrefFor(b.route)}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-botscrew-300 hover:shadow-md"
            >
              <div
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  isVoice(b.route) ? 'bg-amber-50 text-amber-600' : 'bg-botscrew-50 text-botscrew-600',
                ].join(' ')}
              >
                {isVoice(b.route)
                  ? <Headphones className="h-5 w-5" strokeWidth={1.75} />
                  : <TrendingUp className="h-5 w-5" strokeWidth={1.75} />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 group-hover:text-botscrew-700">
                  {b.label}
                </div>
                <div className="text-xs text-slate-400">
                  Bot {b.botId}{isVoice(b.route) ? ' · Voice' : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
