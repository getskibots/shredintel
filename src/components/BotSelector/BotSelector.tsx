import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Check } from 'lucide-react'
import { useAvailableBots, type BotOption } from '../../data/useAnalytics'

/**
 * Top-bar dropdown listing every bot with data in Supabase.
 * Falls back to a hardcoded set of 3 known bots when Supabase is
 * unconfigured or empty.
 *
 * Click a bot → navigates to its canonical route.
 */
export function BotSelector() {
  const { bots, isLive } = useAvailableBots()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Determine active bot from URL — matches curated routes and /bot/:botId
  const active: BotOption | null = (() => {
    for (const b of bots) {
      if (b.route === location.pathname) return b
      if (location.pathname === `/bot/${b.botId}` || location.pathname === `/voice/${b.botId}`) return b
    }
    // /bot/:botId or /voice/:botId with a bot not in the list
    const match = location.pathname.match(/^\/(?:bot|voice)\/(\d+)$/)
    if (match) {
      const id = Number(match[1])
      return { botId: id, label: `Bot ${id}`, route: location.pathname }
    }
    return null
  })()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="whitespace-nowrap">
          {active?.label ?? 'Select bot'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute left-1/2 top-[calc(100%+6px)] z-50 w-[280px] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {bots.length} bot{bots.length === 1 ? '' : 's'}
            {isLive ? ' · live' : ' · known list'}
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {(() => {
              const renderRow = (b: BotOption) => {
                const isActive = active?.botId === b.botId
                return (
                  <li key={b.botId}>
                    <button
                      type="button"
                      onClick={() => {
                        // Preserve search params (e.g. ?period=30d) so the
                        // period selection follows the user across bots.
                        navigate({ pathname: b.route, search: location.search })
                        setOpen(false)
                      }}
                      className={[
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                        isActive ? 'bg-botscrew-50 text-botscrew-700' : 'text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span className="truncate">{b.label}</span>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-botscrew-600" strokeWidth={2.25} />}
                    </button>
                  </li>
                )
              }
              const group = (title: string, list: BotOption[]) =>
                list.length === 0 ? null : (
                  <div key={title}>
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {title} · {list.length}
                    </div>
                    <ul>{list.map(renderRow)}</ul>
                  </div>
                )
              return (
                <>
                  {group('Chat', bots.filter((b) => b.channel !== 'voice'))}
                  {group('Voice', bots.filter((b) => b.channel === 'voice'))}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
