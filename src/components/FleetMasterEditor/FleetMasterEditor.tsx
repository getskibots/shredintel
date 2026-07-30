import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe, X, Loader2, KeyRound, History, RotateCcw, Check } from 'lucide-react'
import {
  fetchPrompts, savePrompt, fetchPromptHistory, PROMPT_MAX,
  hasAdminKey, setAdminKey, type PromptVersion,
} from '../../lib/aiPrompt'
import { isEmbedMode } from '../../lib/embed'

/**
 * Fleet-level editor for the MASTER AI prompt (report._ai_prompts bot 0) — the
 * global ShredIntel base that powers EVERY bot. It lives here on the fleet
 * dashboard (not a per-bot page) because it is fleet-wide, and it is GSB-only:
 * gated behind the admin key (localStorage), never rendered in a partner embed.
 * Includes version history (report._ai_prompt_history) with restore.
 */
export function FleetMasterEditor() {
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(hasAdminKey())
  const [tab, setTab] = useState<'edit' | 'history'>('edit')
  const [master, setMaster] = useState('')
  const [history, setHistory] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (isEmbedMode()) return null // never expose the fleet master inside a partner embed

  async function loadAll() {
    setLoading(true)
    const [p, h] = await Promise.all([fetchPrompts(0), fetchPromptHistory(0)])
    setMaster(p.master)
    setHistory(h)
    setLoading(false)
  }

  async function openEditor() {
    setOpen(true)
    setSaved(false)
    setTab('edit')
    if (hasAdminKey()) {
      setIsAdmin(true)
      await loadAll()
    } else {
      setIsAdmin(false)
    }
  }

  async function unlock() {
    const key = window.prompt('GSB admin key (unlocks the fleet master prompt)')
    if (key == null) return
    setAdminKey(key)
    if (hasAdminKey()) {
      setIsAdmin(true)
      await loadAll()
    }
  }
  function lock() {
    setAdminKey('')
    setIsAdmin(false)
    setMaster('')
    setHistory([])
  }

  async function save() {
    setSaving(true)
    const ok = await savePrompt('master', 0, master)
    setSaving(false)
    if (ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
      setHistory(await fetchPromptHistory(0))
    }
  }

  // Load an old version into the editor for review; the user saves to commit it
  // (which snapshots it as the newest version, so nothing is lost).
  function loadVersion(v: PromptVersion) {
    setMaster(v.prompt)
    setTab('edit')
  }

  const fmtWhen = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        title="Fleet master AI prompt — powers every bot (GSB only)"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-botscrew-300 hover:text-botscrew-700"
      >
        <Globe className="h-3.5 w-3.5" />
        Fleet master
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">ShredIntel · fleet</div>
                <div className="text-base font-semibold text-slate-900">Master AI prompt · all bots</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isAdmin ? (
              /* Locked — GSB unlock */
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <KeyRound className="h-6 w-6" />
                </div>
                <p className="max-w-sm text-sm text-slate-500">
                  The master prompt is the global ShredIntel base shared by <span className="font-medium text-slate-700">every bot</span>. Editing it is GetSkiBots-only.
                </p>
                <button onClick={unlock} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-botscrew-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-botscrew-600">
                  <KeyRound className="h-3.5 w-3.5" /> Unlock with admin key
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 border-b border-slate-100 px-5 pt-3">
                  {([
                    { id: 'edit', label: 'Edit', Icon: Globe },
                    { id: 'history', label: `History${history.length ? ` · ${history.length}` : ''}`, Icon: History },
                  ] as const).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                        tab === id ? 'border-botscrew-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                  <button onClick={lock} title="Lock (clear this machine’s GSB key)" className="ml-auto mb-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:text-slate-500">
                    <KeyRound className="h-3 w-3" /> Lock
                  </button>
                </div>

                {loading ? (
                  <div className="flex h-56 items-center justify-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : tab === 'edit' ? (
                  <div className="space-y-3 overflow-y-auto p-5">
                    <p className="text-sm text-slate-500">
                      The <span className="font-medium text-slate-700">global ShredIntel base</span> — persona, methodology, and capabilities shared by
                      <span className="font-medium text-slate-700"> every bot</span>. Saving changes the AI for the whole fleet. The data grounding (schema + SQL safety) stays fixed.
                    </p>
                    <textarea
                      value={master}
                      onChange={(e) => setMaster(e.target.value.slice(0, PROMPT_MAX))}
                      rows={16}
                      placeholder="The global ShredIntel persona + report methodology…"
                      className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{master.length}/{PROMPT_MAX} · global · all bots</span>
                      <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-botscrew-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-60">
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save to all bots'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 overflow-y-auto p-5">
                    <p className="text-xs text-slate-400">
                      Every save is snapshotted here. Load a version to review it, then Save to make it the live master again.
                    </p>
                    {history.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400">No saved versions yet.</div>
                    ) : (
                      history.map((v, i) => (
                        <div key={v.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-slate-200">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              {fmtWhen(v.saved_at)}
                              {i === 0 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"><Check className="h-2.5 w-2.5" /> current</span>}
                              <span className="text-slate-300">· {v.prompt.length} chars</span>
                            </div>
                            <div className="mt-1 line-clamp-2 font-mono text-[11px] leading-snug text-slate-400">
                              {v.prompt.slice(0, 180) || '(empty)'}
                            </div>
                          </div>
                          <button onClick={() => loadVersion(v)} title="Load this version into the editor" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50">
                            <RotateCcw className="h-3 w-3" /> Load
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
