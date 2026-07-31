/**
 * GA4Connect — the subtle per-bot "Connect Google Analytics" control that lives
 * in the hero corner (next to the branding brush). A resort clicks it, signs into
 * Google in a real OAuth flow, and grants us read-only Analytics access; from then
 * on their site traffic sits alongside the bot's conversations.
 *
 * The OAuth token exchange happens server-side (/api/ga4-oauth); this component
 * only starts the flow, reads status (/api/ga4-connect), lets them pick a property,
 * and triggers an on-demand pull (/api/ga4-refresh). The refresh token never
 * reaches the browser. Renders nothing until GSB has configured OAuth (`ready`).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, Check, X, Loader2, RefreshCw, LogOut, ExternalLink } from 'lucide-react'
import { isEmbedMode } from '../../lib/embed'

interface GA4Property { propertyId: string; displayName: string; account: string }
interface Status {
  ready: boolean
  connected: boolean
  email: string | null
  propertyId: string | null
  status: string | null
  lastSyncedAt: string | null
  lastError: string | null
  hasData: boolean
  properties: GA4Property[]
  pickerError?: string
}

export function GA4Connect({ botId }: { botId: number }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState('')          // 'save' | 'sync' | 'disconnect' | 'list'
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [params, setParams] = useSearchParams()
  const popRef = useRef<HTMLDivElement>(null)

  // Cheap status check (no Google call). Pass list=1 to also fetch the picker.
  const load = useCallback(async (withList = false) => {
    try {
      const r = await fetch(`/api/ga4-connect?botId=${botId}${withList ? '&list=1' : ''}`)
      if (!r.ok) return
      const d: Status = await r.json()
      setStatus(d)
      if (d.propertyId) setSel(d.propertyId)
      else if (d.properties?.length === 1) setSel(d.properties[0].propertyId)
    } catch { /* leave hidden */ }
  }, [botId])

  // Reset + load whenever the bot changes (route param changes without remount).
  useEffect(() => {
    setStatus(null); setOpen(false); setSel(''); setBusy(''); setMsg(''); setErr('')
    if (!botId) return
    load(false)
  }, [botId, load])

  // Handle the OAuth return (?ga4=connected|pick|denied|error), then clean the URL.
  useEffect(() => {
    const flag = params.get('ga4')
    if (!flag) return
    if (flag === 'connected') { setMsg('Google Analytics connected.'); setOpen(true); load(true) }
    else if (flag === 'pick') { setOpen(true); load(true) }
    else if (flag === 'denied') { setErr('Connection cancelled.'); setOpen(true) }
    else if (flag === 'error') { setErr(`Could not connect. ${params.get('ga4msg') || 'Try again.'}`); setOpen(true) }
    const next = new URLSearchParams(params); next.delete('ga4'); next.delete('ga4msg'); setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!status?.ready) return null   // hidden until GSB configures OAuth
  const connected = status.connected

  const openPopover = () => {
    setErr(''); setMsg('')
    setOpen((o) => {
      const next = !o
      if (next && connected && !status.properties?.length) { setBusy('list'); load(true).finally(() => setBusy('')) }
      return next
    })
  }

  const startOAuth = () => {
    const url = `/api/ga4-oauth?botId=${botId}`
    // OAuth can't run inside an iframe → open a top-level tab in embed mode.
    if (isEmbedMode()) window.open(url, '_blank', 'noopener')
    else window.location.href = url
  }

  const saveProperty = async () => {
    if (!sel) return
    setBusy('save'); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/ga4-connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, propertyId: sel }),
      })
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || 'Save failed.'); return }
      setMsg('Property saved. Pulling data…')
      await syncNow()
      await load(false)
    } catch { setErr('Network error.') } finally { setBusy('') }
  }

  const syncNow = async () => {
    setBusy('sync'); setErr('')
    try {
      const r = await fetch('/api/ga4-refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Pull failed.'); return }
      setMsg(`Pulled ${d.days} days · ${d.pages} pages. Refresh the page to see the card.`)
      await load(false)
    } catch { setErr('Network error.') } finally { setBusy('') }
  }

  const disconnect = async () => {
    setBusy('disconnect'); setErr('')
    try {
      await fetch('/api/ga4-connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, disconnect: true }),
      })
      setSel(''); setMsg(''); setOpen(false); await load(false)
    } catch { setErr('Network error.') } finally { setBusy('') }
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={openPopover}
        title={connected ? `Google Analytics connected${status.email ? ` · ${status.email}` : ''}` : 'Connect Google Analytics'}
        className={[
          'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold backdrop-blur transition',
          connected
            ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-white/70 text-slate-400 opacity-50 hover:opacity-100 hover:text-slate-700',
        ].join(' ')}
      >
        <LineChart className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">{connected ? 'Analytics on' : 'Connect Analytics'}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">Google Analytics · bot {botId}</div>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
          </div>

          {!connected ? (
            <>
              <p className="text-[11px] leading-relaxed text-slate-500">
                See this resort&rsquo;s <span className="font-medium text-slate-700">site traffic</span> next to its bot conversations. Sign in with the Google account that owns the GA4 property. Read-only.
              </p>
              <button
                type="button" onClick={startOAuth}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-botscrew-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-botscrew-600"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Continue with Google
              </button>
            </>
          ) : (
            <>
              <div className="text-[11px] text-slate-500">
                Connected{status.email ? <> as <span className="font-medium text-slate-700">{status.email}</span></> : ''}.
              </div>

              <label className="mt-2 block text-[11px] font-medium text-slate-500">GA4 property</label>
              {busy === 'list' ? (
                <div className="mt-1 flex h-8 items-center gap-2 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> loading properties…</div>
              ) : status.properties?.length ? (
                <select
                  value={sel} onChange={(e) => setSel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-botscrew-400"
                >
                  <option value="">Select a property…</option>
                  {status.properties.map((p) => (
                    <option key={p.propertyId} value={p.propertyId}>{p.displayName} · {p.account} ({p.propertyId})</option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 text-[11px] text-slate-400">
                  {status.pickerError ? `Could not list properties: ${status.pickerError}` : `Property ${status.propertyId ?? '(none selected)'}`}
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button" onClick={saveProperty} disabled={!!busy || !sel || sel === status.propertyId}
                  className="inline-flex items-center gap-1 rounded-md bg-botscrew-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-50"
                >
                  {busy === 'save' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                </button>
                <button
                  type="button" onClick={syncNow} disabled={!!busy || !status.propertyId}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-botscrew-700 ring-1 ring-botscrew-200 transition hover:bg-botscrew-50 disabled:opacity-50"
                >
                  {busy === 'sync' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sync now
                </button>
                <button
                  type="button" onClick={disconnect} disabled={!!busy}
                  title="Disconnect" className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:text-rose-600 disabled:opacity-50"
                >
                  <LogOut className="h-3 w-3" /> Disconnect
                </button>
              </div>
            </>
          )}

          {msg && <p className="mt-2 text-[11px] text-emerald-600">{msg}</p>}
          {err && <p className="mt-2 text-[11px] text-rose-600">{err}</p>}
          <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">Read-only. Token is encrypted on the server.</p>
        </div>
      )}
    </div>
  )
}
