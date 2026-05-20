export interface SectionNavItem {
  id: string
  number: string
  name: string
}

export interface SectionNavProps {
  items: SectionNavItem[]
}

export function SectionNav({ items }: SectionNavProps) {
  return (
    <nav
      className="sticky top-[57px] z-[9] border-b border-slate-200 bg-white/80 backdrop-blur"
      aria-label="Analytics sections"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2">
        {items.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="group inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="font-mono text-[10px] font-semibold tracking-wider text-glacier-600">
              §{s.number}
            </span>
            <span className="whitespace-nowrap">{s.name}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
