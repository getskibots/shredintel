import { useEffect, useState } from 'react'
import { EmptyState, Panel } from '../shared'
import { brand } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { ConversionBlockersProps } from '../../types/analytics'

export type { ConversionBlockersProps } from '../../types/analytics'

/** Actionable fix per pinchpoint — "ways to capture more revenue". */
const TIPS: Record<string, string> = {
  Checkout: 'Cut steps and add guest checkout — most drop-off happens right here.',
  Payment: 'Add more payment methods and show clear, specific error messages.',
  Login: 'Offer social / SSO login so guests aren’t walled out mid-purchase.',
  'Password reset': 'Make reset one-click and verify the reset emails actually land.',
  'Account access': 'Let guests reach their purchases without creating a full account.',
  'Order lookup': 'Add self-serve order lookup by email + confirmation number.',
  'Booking change': 'Enable self-serve date and booking changes in the account.',
  Confirmation: 'Auto-send confirmations and add a “resend confirmation” option in chat.',
  Waiver: 'Embed the waiver into checkout so it’s signed at the point of purchase.',
  Voucher: 'Make vouchers auto-apply at checkout instead of manual entry.',
  Credit: 'Auto-apply account credits at checkout so guests don’t drop off.',
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

/**
 * § 2 — ecommerce conversion blockers + Revenue Impact. Resort sets their
 * average order value (persisted per bot); "revenue at risk" = frustrated
 * (negative-sentiment) blocked conversations × that order value.
 */
export function ConversionBlockers({
  blockers,
  affectedConversations,
  affectedShare,
  botId,
}: ConversionBlockersProps & { botId?: number }) {
  const storeKey = `shredintel_aov_${botId ?? 'default'}`
  const [aov, setAov] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(storeKey))
      return v > 0 ? v : 500
    } catch {
      return 500
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, String(aov))
    } catch {
      /* private mode */
    }
  }, [storeKey, aov])

  const empty = !blockers || blockers.length === 0
  const frustrated = blockers.reduce((s, b) => s + (b.negative ?? 0), 0)
  const atRisk = frustrated * aov
  const topBar = Math.max(1, ...blockers.map((b) => b.conversations))
  const tips = blockers.filter((b) => TIPS[b.label]).slice(0, 4)

  return (
    <Panel
      eyebrow="§ 2 Message Intelligence"
      title="Ecommerce conversion blockers"
      description="Where guests get stuck in the buy + account flow — the friction that costs sales."
    >
      {empty ? (
        <EmptyState
          title="No conversion blockers in range."
          message="No account/checkout friction surfaced for this period."
        />
      ) : (
        <>
          {/* Revenue impact — resort sets their order value */}
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-amber-700">
                Revenue at risk · estimated
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-amber-900">
                {usd(atRisk)}
              </div>
              <div className="mt-1 text-xs text-amber-800/80">
                {formatNumber(frustrated)} frustrated buyers × your order value
              </div>
            </div>
            <label className="text-xs">
              <span className="mb-1 block font-medium uppercase tracking-wider text-slate-500">
                Avg. order value
              </span>
              <span className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-2 transition focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-botscrew-100">
                <span className="text-slate-400">$</span>
                <input
                  type="number"
                  min={0}
                  step={25}
                  value={aov}
                  onChange={(e) => setAov(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 bg-transparent px-1 text-sm font-semibold tabular-nums text-slate-900 outline-none"
                  aria-label="Average order value in dollars"
                />
              </span>
            </label>
          </div>

          <p className="mt-4 mb-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{formatNumber(affectedConversations)}</span>{' '}
            conversations ({formatPercent(affectedShare)}) hit a blocker · dollar figures use the
            frustrated (negative-sentiment) share.
          </p>

          {/* Per-blocker bars with dollar impact */}
          <div className="space-y-2">
            {blockers.slice(0, 12).map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <div className="w-32 shrink-0 truncate text-sm text-slate-700" title={b.label}>
                  {b.label}
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ width: `${(b.conversations / topBar) * 100}%`, backgroundColor: brand.gold }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {formatNumber(b.conversations)}
                </div>
                <div className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-amber-800">
                  {usd((b.negative ?? 0) * aov)}
                </div>
              </div>
            ))}
          </div>

          {/* Ways to capture more revenue */}
          {tips.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold text-slate-800">
                Ways to capture more revenue
              </div>
              <ul className="space-y-2">
                {tips.map((b) => (
                  <li
                    key={b.label}
                    className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm sm:flex-row sm:gap-2.5"
                  >
                    <span className="shrink-0 font-semibold text-amber-700">{b.label}</span>
                    <span className="text-slate-600">{TIPS[b.label]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
