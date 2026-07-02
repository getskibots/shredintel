import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  MessageSquare,
  Mic,
  Lightbulb,
  MessageSquareText,
  Shuffle,
  Wand2,
  MessagesSquare,
  Headphones,
  LayoutGrid,
  SlidersHorizontal,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react'

/**
 * Dashboard chrome — sidebar + top bar.
 *
 * Sidebar styling mirrors omni-odin (getskibots/omni-odin/src/components/Sidebar.tsx)
 * pixel-for-pixel so shredintel and omni feel like the same product surface:
 *   - w-[104px] rail on bg-botscrew-500
 *   - full-width row highlight (bg-botscrew-700 active · bg-botscrew-600 hover)
 *   - lucide icons, h-5 w-5, strokeWidth 1.75
 *   - text-[11px] labels
 */

export interface DashboardShellProps {
  /** Bot label shown in the center of the top bar */
  botLabel?: string
  /** User name shown top-right */
  userName?: string
  /** Active channel — drives sidebar highlight */
  activeChannel?: 'chat' | 'voice'
  /** Page content */
  children: ReactNode
}

type NavKey =
  | 'chat'
  | 'voice'
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
  Icon: LucideIcon
  /** If present, item is a real route; otherwise inert (Botscrew chrome) */
  to?: string
  badge?: number
}

const NAV: NavItem[] = [
  { key: 'chat',        label: 'Chat',        to: '/chat',  Icon: MessageSquare },
  { key: 'voice',       label: 'Voice',       to: '/voice', Icon: Mic },
  { key: 'knowledge',   label: 'Knowledge',                 Icon: Lightbulb },
  { key: 'ai-messages', label: 'AI Messages',               Icon: MessageSquareText },
  { key: 'flows',       label: 'Flows',                     Icon: Shuffle },
  { key: 'actions',     label: 'Actions',                   Icon: Wand2 },
  { key: 'triggers',    label: 'Triggers',                  Icon: MessagesSquare },
  { key: 'support',     label: 'Support',                   Icon: Headphones, badge: 9 },
  { key: 'widget',      label: 'Widget',                    Icon: LayoutGrid },
  { key: 'settings',    label: 'Settings',                  Icon: SlidersHorizontal },
  { key: 'help',        label: 'Help',                      Icon: CircleHelp },
]

function MountainLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 36" className={className} aria-hidden>
      <path d="M2 32 L20 8 L30 22 L40 6 L62 32 Z" fill="white" />
      <path d="M2 32 L62 32" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DashboardShell({
  botLabel = '',
  userName = 'Brandon Quinn',
  activeChannel = 'chat',
  children,
}: DashboardShellProps) {
  const location = useLocation()

  const isRowActive = (item: NavItem) => {
    if (item.to) {
      // Real route: highlight when we're on it OR when its channel matches activeChannel
      if (item.key === activeChannel) return true
      return location.pathname.startsWith(item.to)
    }
    return false
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* ── Sidebar (mirrors omni-odin) ────────────────────────────── */}
      <aside
        className="flex w-[104px] shrink-0 flex-col bg-botscrew-500 text-white"
        aria-label="Primary navigation"
      >
        <div className="flex flex-col items-center px-3 pt-4 pb-3">
          <MountainLogo className="w-[56px]" />
        </div>

        <nav className="flex-1 py-2">
          {NAV.map((item) => {
            const active = isRowActive(item)
            const rowClass = [
              'flex flex-col items-center justify-center gap-1.5 py-4 transition',
              active
                ? 'bg-botscrew-700 text-white'
                : 'text-white/90 hover:bg-botscrew-600',
            ].join(' ')
            const inner = (
              <>
                <div className="relative">
                  <item.Icon strokeWidth={1.75} className="h-5 w-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-botscrew-500">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] leading-tight">{item.label}</span>
              </>
            )
            return item.to ? (
              <Link
                key={item.key}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={rowClass}
              >
                {inner}
              </Link>
            ) : (
              <a
                key={item.key}
                href="#"
                aria-disabled
                onClick={(e) => e.preventDefault()}
                className={rowClass}
              >
                {inner}
              </a>
            )
          })}
        </nav>
      </aside>

      {/* ── Main column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mirrors omni-odin TopBar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">
            <Link
              to="/chat/mc"
              className="text-botscrew-500 hover:underline"
            >
              Home
            </Link>
          </div>
          {botLabel && (
            <div className="text-base font-semibold text-ink-900">{botLabel}</div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-slate-700">
              {userName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)}
            </div>
            <span className="text-sm text-slate-700">{userName}</span>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
