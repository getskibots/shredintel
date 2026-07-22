import type { ReactNode } from 'react'
import logoUrl from '../../assets/logo.png'

/**
 * MasterBotterShell — the standalone chrome for the fleet master dashboard.
 * Deliberately NOT the Botscrew-admin sidebar (DashboardShell): this is a
 * GSB-internal product surface with its own identity. A sticky brand banner
 * in the Get Ski Bots blue (botscrew-500, same as the old sidebar) carries the
 * white logo + "Master'Botter" wordmark; content flows below on a soft canvas.
 */
export function MasterBotterShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-botscrew-500 shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Get Ski Bots" className="h-10 w-auto" />
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              Master<span className="text-brand-gold">&rsquo;Botter</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="hidden sm:inline">Fleet cost &amp; usage</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              live
            </span>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
