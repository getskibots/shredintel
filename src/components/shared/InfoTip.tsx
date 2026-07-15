import { Info } from 'lucide-react'

/**
 * The "more information" affordance: a small ⓘ that reveals a styled dark tooltip
 * on hover/focus. Pure CSS (group-hover / focus-within) — no state. The tooltip
 * floats above the icon at a high z-index, so keep InfoTip out of any
 * overflow-hidden ancestor or it will clip.
 *
 * `normal-case` + `tracking-normal` reset the uppercase/letter-spacing that label
 * rows apply, so the definition reads as plain sentence text.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label="More information"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:text-slate-600"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
