import { useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { getPromptOverride, setPromptOverride, PROMPT_MAX } from '../../lib/aiPrompt'

/**
 * Semi-discreet editor for the custom AI-instructions layer. A subtle gear opens
 * a modal with a textarea; saving persists per-bot (localStorage) and the next
 * text/voice request picks it up. Powers both the ask bar and the voice AI.
 */
export function PromptEditor({ botId }: { botId: number }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  function openEditor() {
    setText(getPromptOverride(botId))
    setSaved(false)
    setOpen(true)
  }

  function save() {
    setPromptOverride(botId, text)
    setSaved(true)
    setTimeout(() => setOpen(false), 650)
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
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
              <p className="text-sm text-slate-500">
                Extra guidance appended to ShredIntel’s system prompt — powers{' '}
                <span className="font-medium text-slate-700">both text search and voice</span>. Tell it about its capabilities,
                tone, and priorities. The data grounding (schema + SQL safety) stays fixed.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, PROMPT_MAX))}
                rows={12}
                autoFocus
                placeholder={'e.g. You can chart any breakdown, pull up real guest conversations on request, and reconcile totals with the admin. Lead with revenue-impacting findings. Keep answers warm and concise — you’re a sharp analyst, not a support bot.'}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{text.length}/{PROMPT_MAX} · saved locally</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setText('')} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50">
                    Clear
                  </button>
                  <button onClick={save} className="rounded-full bg-botscrew-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-botscrew-600">
                    {saved ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
