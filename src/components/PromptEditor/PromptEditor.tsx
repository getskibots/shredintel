import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings2, X, Loader2, Building2 } from 'lucide-react'
import { fetchPrompts, savePrompt, PROMPT_MAX } from '../../lib/aiPrompt'

/**
 * Per-bot editor for THIS resort's AI guidance (the slave layer,
 * report._ai_prompts bot_id = this bot). A subtle gear opens a modal; saving
 * persists and the next text/voice request picks it up.
 *
 * The fleet-wide MASTER prompt is NOT edited here — it powers every bot and is
 * GSB-only, so it lives on the fleet dashboard (FleetMasterEditor). The fixed
 * data grounding (schema + SQL safety) is not editable anywhere in-app.
 */
export function PromptEditor({ botId }: { botId: number }) {
  const [open, setOpen] = useState(false)
  const [slave, setSlave] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function openEditor() {
    setOpen(true)
    setSaved(false)
    setLoading(true)
    const p = await fetchPrompts(botId)
    setSlave(p.slave)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const ok = await savePrompt('bot', botId, slave)
    setSaving(false)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        title="Edit AI instructions"
        aria-label="Edit AI instructions"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">AI instructions</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">ShredIntel</div>
                <div className="text-base font-semibold text-slate-900">AI instructions</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Building2 className="h-3.5 w-3.5 text-slate-400" /> This resort
              </div>
              <p className="text-sm text-slate-500">
                Guidance for <span className="font-medium text-slate-700">this resort only</span>, layered on top of the fleet base.
                Powers <span className="font-medium text-slate-700">both text search and voice</span>.
              </p>

              {loading ? (
                <div className="flex h-48 items-center justify-center text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <textarea
                  value={slave}
                  onChange={(e) => setSlave(e.target.value.slice(0, PROMPT_MAX))}
                  rows={14}
                  autoFocus
                  placeholder='e.g. This resort calls lift tickets “day passes.” Lead with revenue findings and flag any lodging questions.'
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{slave.length}/{PROMPT_MAX} · bot #{botId}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSlave('')} disabled={loading} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-40">
                    Clear
                  </button>
                  <button onClick={save} disabled={loading || saving} className="inline-flex items-center gap-1.5 rounded-full bg-botscrew-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-60">
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
