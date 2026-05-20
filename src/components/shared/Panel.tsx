import type { ReactNode } from 'react'

export interface PanelProps {
  /** Tiny label above the title, e.g. "§ 2 Message Intelligence" */
  eyebrow?: string
  title: string
  description?: string
  /** Right-aligned content in the header (e.g. a stat callout) */
  action?: ReactNode
  /** Optional className passthrough for special variants */
  className?: string
  children: ReactNode
}

export function Panel({
  eyebrow,
  title,
  description,
  action,
  className,
  children,
}: PanelProps) {
  return (
    <section
      className={[
        'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6',
        className ?? '',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-glacier-600">
              {eyebrow}
            </div>
          )}
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h3>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  )
}
