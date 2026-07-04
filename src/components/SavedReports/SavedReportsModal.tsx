import { useState } from 'react'
import { X, Trash2, Download, Mail, Copy, Check, Bookmark } from 'lucide-react'
import { ReportCardView } from '../ReportCards'
import { ConversationExplorer } from '../ConversationExplorer'
import {
  listSavedReports,
  deleteSavedReport,
  downloadReport,
  mailtoForReport,
  copyReportSummary,
  type SavedReport,
  type DrillFilter,
} from '../../lib/savedReports'

/**
 * Saved-reports drawer: browse the voice/ask reports a manager kept, reopen one
 * (cards render identically to the live session), drill into the real
 * conversations behind any card, and share — download a self-contained HTML
 * report, draft an email (their client, they send), or copy the summary.
 */
export function SavedReportsModal({ botId, onClose }: { botId: number; onClose: () => void }) {
  const [reports, setReports] = useState<SavedReport[]>(() => listSavedReports(botId))
  const [openId, setOpenId] = useState<string | null>(reports[0]?.id ?? null)
  const [drill, setDrill] = useState<DrillFilter | null>(null)
  const [copied, setCopied] = useState(false)

  const open = reports.find((r) => r.id === openId) ?? null

  function remove(id: string) {
    deleteSavedReport(botId, id)
    const next = listSavedReports(botId)
    setReports(next)
    if (openId === id) setOpenId(next[0]?.id ?? null)
  }

  async function copy() {
    if (!open) return
    const ok = await copyReportSummary(open)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-botscrew-500" />
            <span className="text-base font-semibold text-slate-900">Saved reports</span>
            <span className="text-sm text-slate-400">{reports.length}</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        {reports.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No saved reports yet. Start a voice session, ask a few questions, then tap <span className="font-medium text-slate-700">Save</span>.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Report picker */}
            <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                    r.id === openId ? 'border-botscrew-300 bg-botscrew-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="max-w-[180px] truncate text-xs font-semibold text-slate-800">{r.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {r.cards.length} · {r.persona}
                  </div>
                </button>
              ))}
            </div>

            {open && (
              <>
                {/* Share / delete actions */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <button onClick={() => downloadReport(open)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                  <a href={mailtoForReport(open)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    <Mail className="h-3.5 w-3.5" /> Email to team
                  </a>
                  <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => remove(open.id)} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>

                {/* Cards */}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5">
                  {open.cards.map((c, i) => (
                    <ReportCardView key={i} card={c} onDrill={setDrill} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {drill && <ConversationExplorer botId={botId} filter={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}
