import { CalendarOff } from 'lucide-react'

/**
 * Page-level empty state for a LIVE bot that simply has no conversations in the
 * selected window (e.g. a low-volume bot on "Yesterday"). Shown in place of the
 * whole panel stack, so an empty range reads as one intentional message instead
 * of a wall of per-panel "No data" cards.
 */
export function EmptyRange({
  botName,
  periodLabel,
  onViewAll,
}: {
  botName: string
  periodLabel?: string
  onViewAll: () => void
}) {
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <CalendarOff className="h-5 w-5 text-slate-400" strokeWidth={1.75} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-800">No conversations in this range</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {botName} has no chats {periodLabel ? `for ${periodLabel.toLowerCase()}` : 'in the selected period'}. Try a wider window.
      </p>
      <button
        type="button"
        onClick={onViewAll}
        className="mt-5 rounded-lg bg-botscrew-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-botscrew-600"
      >
        View all time
      </button>
    </div>
  )
}
