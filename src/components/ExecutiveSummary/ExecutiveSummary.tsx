import { useState } from 'react'
import { Sparkles, Loader2, Bookmark, Check, Download, Mail, Copy, RefreshCw } from 'lucide-react'
import { Panel } from '../shared'
import { ReportCardView } from '../ReportCards'
import { ConversationExplorer } from '../ConversationExplorer'
import { payloadFromDatum, type DrillPayload } from '../../lib/drill'
import {
  newReportId, saveReport, downloadReport, mailtoForReport, copyReportSummary,
  type ReportCard, type DrillFilter, type SavedReport,
} from '../../lib/savedReports'

/**
 * ExecutiveSummary — one click (or one voice command) turns the selected window
 * into a decision-ready brief: a plain-English narrative plus the key metric
 * cards (volume, sentiment, topics, revenue at risk, blockers, what changed).
 * It reuses the report-card plumbing, so every card drills (tap a bar → the real
 * conversations) and the whole brief shares as a self-contained document.
 */
export function ExecutiveSummary({ botId, range, className }: {
  botId: number
  range: { from: string; to: string; label?: string }
  className?: string
}) {
  const [cards, setCards] = useState<ReportCard[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [drill, setDrill] = useState<(DrillFilter & { from?: string; to?: string }) | null>(null)
  const [drillPayload, setDrillPayload] = useState<DrillPayload | null>(null)

  async function generate() {
    setLoading(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, from: range.from, to: range.to, label: range.label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setCards(Array.isArray(data.cards) ? data.cards : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the summary')
    } finally {
      setLoading(false)
    }
  }

  const report = (): SavedReport => ({
    id: newReportId(), botId, persona: 'ShredIntel',
    title: `Executive summary · ${range.label ?? `${range.from} to ${range.to}`}`,
    createdAt: Date.now(), cards: cards ?? [],
  })
  const onChartDrill = (datum: Record<string, unknown>) => {
    const p = payloadFromDatum(datum, { botId, from: range.from, to: range.to })
    if (p) setDrillPayload(p)
  }

  const narrative = cards?.[0]
  const metrics = cards?.slice(1) ?? []

  return (
    <Panel className={className} eyebrow="Executive summary" title="The whole window, in one brief"
      description="One click turns the selected dates into a decision-ready summary you can read, drill into, and share.">
      {!cards && (
        <div className="py-6 text-center">
          <button type="button" onClick={generate} disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-botscrew-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" strokeWidth={2} />}
            {loading ? 'Building your brief…' : `Generate for ${range.label ?? 'this range'}`}
          </button>
          {error && <p className="mt-3 text-sm text-amber-600">{error}</p>}
        </div>
      )}

      {cards && (
        <div>
          {/* share toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={generate} disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
            <button type="button" onClick={() => { saveReport(report()); setSaved(true) }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              {saved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Bookmark className="h-3.5 w-3.5" />} {saved ? 'Saved' : 'Save'}
            </button>
            <button type="button" onClick={() => downloadReport(report())}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <a href={mailtoForReport(report())}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
            <button type="button" onClick={async () => { if (await copyReportSummary(report())) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
          </div>

          {/* narrative */}
          {narrative && (
            <div className="mb-5 rounded-2xl border border-botscrew-100 bg-botscrew-50/50 p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-botscrew-700">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} /> {narrative.question}
              </div>
              <p className="text-[15px] leading-relaxed text-slate-800">{narrative.answer}</p>
            </div>
          )}

          {/* metric cards */}
          <div className="space-y-4">
            {metrics.map((c, i) => (
              <ReportCardView key={i} card={c} onDrill={setDrill} onChartDrill={onChartDrill} />
            ))}
          </div>
        </div>
      )}

      {drill && <ConversationExplorer botId={botId} range={drill.from && drill.to ? { from: drill.from, to: drill.to } : range} filter={drill} onClose={() => setDrill(null)} />}
      {drillPayload && <ConversationExplorer botId={botId} payload={drillPayload} onClose={() => setDrillPayload(null)} />}
    </Panel>
  )
}
