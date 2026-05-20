export interface PlaceholderProps {
  title: string
  description?: string
  /** Source field hint, e.g. "device_category · browser" */
  source?: string
}

export function Placeholder({ title, description, source }: PlaceholderProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-slate-700">
          {title}
        </h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Planned
        </span>
      </div>
      {description && (
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      )}
      {source && (
        <p className="mt-3 font-mono text-[11px] text-slate-400">{source}</p>
      )}
    </div>
  )
}
