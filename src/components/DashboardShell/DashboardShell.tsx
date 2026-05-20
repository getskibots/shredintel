import type { ReactNode } from 'react'

/**
 * Faithful re-creation of the Botscrew admin chrome:
 *  - Left rail (navy) with stacked icon nav and a logo header/footer
 *  - Top bar (white) with breadcrumb, bot selector, "Test in Messenger / AI / widget", profile
 *  - Main content area (light-gray) for the analytics page
 *
 * Icons are inline SVGs to avoid adding a dependency. Single-purpose, no theme switching.
 */

export interface DashboardShellProps {
  /** Bot label shown in the center of the top bar */
  botLabel?: string
  /** User name shown top-right */
  userName?: string
  /** Active nav item key */
  activeNav?: NavKey
  /** Page content */
  children: ReactNode
}

type NavKey =
  | 'analytics'
  | 'knowledge'
  | 'ai-messages'
  | 'flows'
  | 'actions'
  | 'triggers'
  | 'support'
  | 'widget'
  | 'settings'
  | 'help'

interface NavItem {
  key: NavKey
  label: string
  icon: ReactNode
  badge?: number
}

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d={path} />
  </svg>
)

const NAV: NavItem[] = [
  { key: 'analytics', label: 'Analytics', icon: icon('M3 17l6-6 4 4 8-8M14 7h7v7') },
  { key: 'knowledge', label: 'Knowledge', icon: icon('M12 2a3 3 0 00-3 3v1H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V8a2 2 0 00-2-2h-2V5a3 3 0 00-3-3zM9 13h6M9 17h6') },
  { key: 'ai-messages', label: 'AI Messages', icon: icon('M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.6-.8L3 21l1.8-5.9A8.5 8.5 0 1121 11.5z') },
  { key: 'flows', label: 'Flows', icon: icon('M7 7l4 4-4 4M17 7l-4 4 4 4') },
  { key: 'actions', label: 'Actions', icon: icon('M13 2L3 14h7l-1 8 10-12h-7l1-8z') },
  { key: 'triggers', label: 'Triggers', icon: icon('M9 12h6M9 16h6M9 8h6M5 21V5a2 2 0 012-2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2z') },
  { key: 'support', label: 'Support', icon: icon('M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z'), badge: 9 },
  { key: 'widget', label: 'Widget', icon: icon('M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.6-.8L3 21l1.8-5.9A8.5 8.5 0 1121 11.5z') },
  { key: 'settings', label: 'Settings', icon: icon('M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z') },
  { key: 'help', label: 'Help', icon: icon('M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1110-10 10 10 0 01-10 10z') },
]

function MountainLogo({ className = '' }: { className?: string }) {
  // Simplified GSB mark — three peaks
  return (
    <svg viewBox="0 0 64 36" className={className} aria-hidden>
      <path d="M2 32 L20 8 L30 22 L40 6 L62 32 Z" fill="white" />
      <path d="M2 32 L62 32" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DashboardShell({
  botLabel = 'Get Ski Tickets — ACTIVE',
  userName = 'Brandon Quinn',
  activeNav = 'analytics',
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* ── Left rail ──────────────────────────────────────────────── */}
      <aside
        className="flex w-[72px] flex-col bg-gradient-to-b from-[#1e3a5f] to-[#16273e] text-white"
        aria-label="Primary navigation"
      >
        <div className="flex h-14 items-center justify-center border-b border-white/10">
          <MountainLogo className="h-7" />
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="flex flex-col items-stretch gap-1 px-2">
            {NAV.map((item) => {
              const isActive = item.key === activeNav
              return (
                <li key={item.key}>
                  <a
                    href="#"
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'group relative flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    ].join(' ')}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-sky-400" />
                    )}
                    <div className="relative">
                      {item.icon}
                      {item.badge !== undefined && (
                        <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span className="leading-tight">{item.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex h-12 items-center justify-center border-t border-white/10">
          <MountainLogo className="h-5 opacity-60" />
        </div>
      </aside>

      {/* ── Main column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="text-sm font-semibold text-sky-600 hover:text-sky-700"
            >
              Home
            </a>
          </div>
          <div className="text-sm font-semibold tracking-tight text-slate-900">
            {botLabel}
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 md:inline-flex">
              Test in Messenger ▾
            </button>
            <button className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">
              Test AI chat
            </button>
            <button className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">
              Test widget
            </button>
            <div className="ml-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
                {userName
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <span className="text-xs font-medium text-slate-700">{userName}</span>
              <span aria-hidden className="text-xs text-slate-400">
                ▾
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
