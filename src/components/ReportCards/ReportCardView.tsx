import { MessagesSquare } from 'lucide-react'
import { VegaLiteChart } from '../VegaLiteChart'
import type { DrillFilter, ReportCard } from '../../lib/savedReports'

/**
 * One report card: the spoken question, ShredIntel's answer, the Vega chart it
 * built, and — when the answer is about one slice — a "Read the conversations"
 * button that drills to the real transcripts. Shared by the voice takeover and
 * the Saved-reports viewer so both render identically.
 */
export function ReportCardView({ card, onDrill, onChartDrill }: {
  card: ReportCard
  onDrill?: (d: DrillFilter) => void
  /** Click any chart mark → its datum (drills to the card's window). */
  onChartDrill?: (datum: Record<string, unknown>) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {card.question && <div className="mb-2 text-xs font-medium text-slate-400">“{card.question}”</div>}
      <p className="text-[15px] leading-relaxed text-slate-800">{card.answer}</p>
      {card.vegaLite && card.rows.length > 0 && (
        <div className="mt-4">
          <VegaLiteChart spec={card.vegaLite} rows={card.rows} onDrill={onChartDrill} />
        </div>
      )}
      {card.drill && onDrill && (
        <button
          type="button"
          onClick={() => onDrill(card.drill!)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-botscrew-200 bg-botscrew-50 px-3.5 py-1.5 text-xs font-semibold text-botscrew-700 transition hover:bg-botscrew-100"
        >
          <MessagesSquare className="h-3.5 w-3.5" /> Read the {card.drill.label} conversations
        </button>
      )}
    </div>
  )
}
