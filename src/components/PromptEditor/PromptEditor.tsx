import { useState } from 'react'
import { Settings2, X, Loader2, Globe, Building2 } from 'lucide-react'
import { fetchPrompts, savePrompt, PROMPT_MAX, type PromptScope } from '../../lib/aiPrompt'

/**
 * Semi-discreet editor for the two AI-instruction layers (Supabase-backed via
 * /api/prompt): the MASTER (global ShredIntel base — persona + methodology,
 * shared by every bot) and the per-bot SLAVE (this resort only). A subtle gear
 * opens a modal; saving persists the selected layer and the next text/voice
 * request picks it up. The fixed data grounding (schema + SQL safety) is not
 * editable here.
 */
export function PromptEditor({ botId }: { botId: number }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<PromptScope>('bot')
  const [master, setMaster] = useState('')
  const [slave, setSlave] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const text = scope === 'master' ? master : slave
  const setText = (v: string) => (scope === 'master' ? setMaster : setSlave)(v.slice(0, PROMPT_MAX))

  async function openEditor() {
    setOpen(true)
    setSaved(false)
    setScope('bot')
    setLoading(true)
    const p = await fetchPrompts(botId)
    setMaster(p.master)
    setSlave(p.slave)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const ok = await savePrompt(scope, botId, text)
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

            {/* Layer toggle: per-resort (slave) vs the global master base */}
            <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
              {([
                { id: 'bot', label: 'This resort', Icon: Building2 },
                { id: 'master', label: 'Master · all resorts', Icon: Globe },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setScope(id)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                    scope === id ? 'border-botscrew-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-3 overflow-y-auto p-5">
              {scope === 'master' ? (
                <p className="text-sm text-slate-500">
                  The <span className="font-medium text-slate-700">global ShredIntel base</span> — persona, methodology, and
                  capabilities shared by <span className="font-medium text-slate-700">every resort</span>. Editing this changes the
                  AI for all bots. The data grounding (schema + SQL safety) stays fixed.
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Guidance for <span className="font-medium text-slate-700">this resort only</span>, layered on top of the master.
                  Powers <span className="font-medium text-slate-700">both text search and voice</span>.
                </p>
              )}

              {loading ? (
                <div className="flex h-48 items-center justify-center text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={14}
                  autoFocus
                  placeholder={
                    scope === 'master'
                      ? 'The global ShredIntel persona + report methodology…'
                      : 'e.g. This resort calls lift tickets “day passes.” Lead with revenue findings and flag any lodging questions.'
                  }
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
                />
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {text.length}/{PROMPT_MAX} · {scope === 'master' ? 'global · all resorts' : `bot #${botId}`}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setText('')} disabled={loading} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-40">
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
        </div>
      )}
    </>
  )
}
