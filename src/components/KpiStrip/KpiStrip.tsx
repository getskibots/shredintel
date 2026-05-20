import type { KpiTileData } from '../../types/analytics'

export interface KpiStripProps {
  tiles: KpiTileData[]
}

const accentRing: Record<NonNullable<KpiTileData['accent']>, string> = {
  glacier: 'before:bg-glacier-500',
  summit: 'before:bg-summit-500',
  success: 'before:bg-success',
  danger: 'before:bg-danger',
  none: 'before:bg-slate-300',
}

const deltaTone: Record<NonNullable<KpiTileData['deltaTone']>, string> = {
  positive: 'bg-success/10 text-success',
  negative: 'bg-danger/10 text-danger',
  neutral: 'bg-slate-100 text-slate-600',
  alert: 'bg-summit-500/15 text-summit-500',
}

export function KpiStrip({ tiles }: KpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={[
            'group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-card',
            'before:absolute before:left-0 before:top-0 before:h-full before:w-1',
            accentRing[t.accent ?? 'none'],
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t.label}
            </div>
            {t.delta && (
              <span
                className={[
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                  deltaTone[t.deltaTone ?? 'neutral'],
                ].join(' ')}
              >
                {t.delta}
              </span>
            )}
          </div>
          <div className="mt-3 font-display text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {t.value}
          </div>
          {t.caption && (
            <div className="mt-1 text-xs text-slate-500">{t.caption}</div>
          )}
        </div>
      ))}
    </div>
  )
}
