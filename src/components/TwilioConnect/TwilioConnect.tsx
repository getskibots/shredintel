/**
 * TwilioConnect — the per-bot "Connect Twilio" control that lives in the voice
 * dashboard header. GSB drops in this bot's Twilio Account SID (+ inbound number)
 * right here, per bot — no separate admin page. Powers /api/recording + the
 * transfer ingest for that bot.
 *
 * HIDDEN inside the resort embed (isEmbedMode) — only GSB sees/edits telephony
 * config. Reads/writes report.bot_twilio via /api/bot-twilio (server-only table).
 * The Account SID is semi-public; the auth token stays in server env.
 */
import { useEffect, useRef, useState } from 'react'
import { Phone, Check, X, Loader2, RefreshCw } from 'lucide-react'
import { isEmbedMode } from '../../lib/embed'

interface Mapping {
  bot_id: number
  name: string | null
  account_sid: string | null
  phone_number: string | null
  label: string | null
  /** True when an encrypted auth token is stored server-side (never the token itself). */
  has_token?: boolean
}

export function TwilioConnect({ botId }: { botId: number }) {
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [open, setOpen] = useState(false)
  const [sid, setSid] = useState('')
  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [err, setErr] = useState('')
  const popRef = useRef<HTMLDivElement>(null)

  const connected = !!mapping?.account_sid

  // Load this bot's current mapping.
  useEffect(() => {
    // The popover lives in a component that is REUSED across bots (the route param
    // changes without a remount), so clear all per-bot state first — otherwise the
    // previous bot's sync result / token field bleeds onto the next bot.
    setMapping(null); setSid(''); setPhone(''); setLabel(''); setToken(''); setSyncResult(''); setErr('')
    if (isEmbedMode() || !botId) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/bot-twilio?botId=${botId}`)
        if (!r.ok || cancelled) return
        const d = await r.json()
        if (cancelled) return
        const mp: Mapping | null = d.mapping ?? null
        setMapping(mp)
        setSid(mp?.account_sid ?? '')
        setPhone(mp?.phone_number ?? '')
        setLabel(mp?.label ?? '')
      } catch { /* leave as "Connect" */ }
    })()
    return () => { cancelled = true }
  }, [botId])

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (isEmbedMode()) return null

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const payload: Record<string, unknown> = {
        bot_id: botId, account_sid: sid.trim(), phone_number: phone.trim(), label: label.trim(),
      }
      // Only send the token when the user typed one — blank leaves the stored token as is.
      const t = token.trim()
      if (t) payload.auth_token = t
      const r = await fetch('/api/bot-twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Save failed.'); return }
      setMapping((m) => ({
        bot_id: botId, name: m?.name ?? null,
        account_sid: sid.trim() || null, phone_number: phone.trim() || null, label: label.trim() || null,
        has_token: (m?.has_token ?? false) || !!t,
      }))
      setToken('')
      setOpen(false)
    } catch { setErr('Network error.') } finally { setSaving(false) }
  }

  // Pull this bot's inbound calls from Twilio and rebuild the connect-rate rollup —
  // the self-serve step that used to be an ETL script. Needs a saved token.
  const syncNow = async () => {
    setSyncing(true); setErr(''); setSyncResult('')
    try {
      const r = await fetch('/api/twilio-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Sync failed.'); return }
      setSyncResult(`${Number(d.inbound).toLocaleString()} calls · ${d.connectPct}% connect. Refresh to update the charts.`)
    } catch { setErr('Network error.') } finally { setSyncing(false) }
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={connected ? `Twilio connected · ${mapping?.account_sid}` : 'Connect this bot to its Twilio account'}
        className={[
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition',
          connected
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-slate-700',
        ].join(' ')}
      >
        <Phone className="h-3 w-3" strokeWidth={2.25} />
        {connected ? 'Twilio connected' : 'Connect Twilio'}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">Twilio account · bot {botId}</div>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
          </div>

          <label className="block text-[11px] font-medium text-slate-500">Account SID</label>
          <input
            value={sid} onChange={(e) => setSid(e.target.value)} placeholder="AC…" autoFocus
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-botscrew-400"
          />

          <label className="mt-2 block text-[11px] font-medium text-slate-500">Inbound number <span className="text-slate-300">(optional)</span></label>
          <input
            value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1…"
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-botscrew-400"
          />

          <label className="mt-2 block text-[11px] font-medium text-slate-500">Label <span className="text-slate-300">(optional)</span></label>
          <input
            value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Project / account name"
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-botscrew-400"
          />

          <label className="mt-2 block text-[11px] font-medium text-slate-500">
            Auth token{' '}
            {mapping?.has_token
              ? <span className="text-emerald-600">· saved</span>
              : <span className="text-slate-300">(needed to read data)</span>}
          </label>
          <input
            type="password" value={token} onChange={(e) => setToken(e.target.value)}
            autoComplete="off" spellCheck={false}
            placeholder={mapping?.has_token ? 'Paste to replace' : 'Paste Twilio Auth Token'}
            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-botscrew-400"
          />

          {err && <p className="mt-2 text-[11px] text-rose-600">{err}</p>}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Token is encrypted on the server.</span>
            <button
              type="button" onClick={save} disabled={saving || !sid.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-botscrew-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {mapping?.has_token && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <span className="text-[10px] text-slate-400">
                {syncResult || 'Pull live calls from Twilio.'}
              </span>
              <button
                type="button" onClick={syncNow} disabled={syncing}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-botscrew-700 ring-1 ring-botscrew-200 transition hover:bg-botscrew-50 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
