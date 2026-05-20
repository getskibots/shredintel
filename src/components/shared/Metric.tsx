import type { ReactNode } from 'react'

export interface MetricProps {
  label: string
  value: ReactNode
  subValue?: ReactNode
  tone?: 'default' | 'good' | 'risk' | 'neutral' | 'accent' | 'warn'
}

const toneRing: Record<NonNullable<MetricProps['tone']>, string> = {
  default: 'border-slate-200',
  good: 'border-emerald-200 bg-emerald-50/40',
  risk: 'border-rose-200 bg-rose-50/40',
  neutral: 'border-slate-200 bg-slate-50/40',
  accent: 'border-sky-200 bg-sky-50/40',
  warn: 'border-amber-200 bg-amber-50/40',
}

const toneText: Record<NonNullable<MetricProps['tone']>, string> = {
  default: 'text-slate-900',
  good: 'text-emerald-700',
  risk: 'text-rose-700',
  neutral: 'text-slate-900',
  accent: 'text-sky-700',
  warn: 'text-amber-700',
}

export function Metric({ label, value, subValue, tone = 'default' }: MetricProps) {
  return (
    <div className={['rounded-2xl border p-4', toneRing[tone]].join(' ')}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={[
          'mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight',
          toneText[tone],
        ].join(' ')}
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-0.5 text-xs text-slate-500">{subValue}</div>
      )}
    </div>
  )
}
