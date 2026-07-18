import type { ReactNode } from 'react'
import { Bot } from 'lucide-react'

/**
 * MasterBotterShell — the standalone chrome for the fleet master dashboard.
 * Deliberately NOT the Botscrew-admin sidebar (DashboardShell): this is a
 * GSB-internal product surface with its own clean, contemporary identity.
 * A slim sticky header carries the "Master'Botter" wordmark; the content
 * flows full-width below on a soft background.
 */
export function MasterBotterShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-botscrew-500 to-botscrew-700 text-white shadow-sm">
              <Bot className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight">
              Master<span className="text-botscrew-600">&rsquo;Botter</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline">Fleet cost &amp; usage</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              live
            </span>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
