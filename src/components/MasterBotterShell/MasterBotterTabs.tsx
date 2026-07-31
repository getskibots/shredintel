import { Link, useLocation } from 'react-router-dom'

/**
 * The two Master'Botter tabs: "The Daily Fix" (the daily heartbeat, default at
 * /fleet) and "Daily Cost" (the fleet cost view at /fleet/costs). Underline-style,
 * URL-addressable so each is shareable.
 */
const TABS = [
  { key: 'fix', label: 'The Daily Fix', to: '/fleet' },
  { key: 'costs', label: 'Daily Cost', to: '/fleet/costs' },
] as const

export function MasterBotterTabs() {
  const location = useLocation()
  const active = location.pathname === '/fleet/costs' ? 'costs' : 'fix'
  return (
    <div className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-7xl gap-6 px-4 md:px-6">
        {TABS.map((t) => {
          const isActive = t.key === active
          return (
            <Link
              key={t.key}
              to={`${t.to}${location.search}`}
              className={[
                '-mb-px border-b-2 py-3 text-sm font-medium transition',
                isActive
                  ? 'border-botscrew-500 text-botscrew-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              ].join(' ')}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
