import type { ReactNode } from 'react'

export interface SectionHeaderProps {
  /** "1" | "2" | "3" | "4" — matches the export's section numbering */
  number: string
  /** "Conversation Core", "Message Intelligence", etc. */
  name: string
  /** One-line tagline answering "what question does this section answer?" */
  tagline: string
  /** Optional anchor id for the sticky section nav */
  id?: string
  /** Optional right-aligned action (e.g. a context button) */
  action?: ReactNode
}

export function SectionHeader({ number, name, tagline, id, action }: SectionHeaderProps) {
  return (
    <div
      id={id}
      className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3 pt-2"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs font-semibold tracking-widest text-botscrew-500">
          § {number}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          {name}
        </h2>
        <span className="text-sm text-slate-500">— {tagline}</span>
      </div>
      {action}
    </div>
  )
}
