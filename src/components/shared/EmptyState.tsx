export interface EmptyStateProps {
  title: string
  message: string
  /** Tailwind min-height, defaults to a comfortable card height */
  minHeight?: string
}

export function EmptyState({
  title,
  message,
  minHeight = 'min-h-[220px]',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center',
        minHeight,
      ].join(' ')}
    >
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-500">{message}</p>
    </div>
  )
}
