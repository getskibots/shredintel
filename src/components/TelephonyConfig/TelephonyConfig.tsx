/**
 * TelephonyConfig — GSB-internal console to map each voice bot to its Twilio
 * account (SID) + inbound number. Powers /api/recording + the transfer ingest.
 * Gated by the GSB admin key (sent to /api/bot-twilio); resorts can't use it.
 * The Account SID isn't a secret; the auth token stays in env for now.
 */
import { useState } from 'react'

interface Row {
  bot_id: number
  name: string | null
  voice_convs: number | null
  account_sid: string | null
  phone_number: string | null
  label: string | null
}

export function TelephonyConfig() {
  const [key, setKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = async (k: string) => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/bot-twilio', { headers: { 'x-gsb-admin-key': k } })
      if (r.status === 401) { setErr('Wrong admin key.'); return }
      if (!r.ok) { setErr('Failed to load.'); return }
      const d = await r.json()
      setRows(d.bots ?? []); setAuthed(true)
    } catch { setErr('Network error.') } finally { setBusy(false) }
  }

  const edit = (id: number, field: keyof Row, val: string) =>
    setRows((rs) => rs.map((r) => (r.bot_id === id ? { ...r, [field]: val } : r)))

  const save = async (row: Row) => {
    setSavingId(row.bot_id); setMsg(''); setErr('')
    try {
      const r = await fetch('/api/bot-twilio', {
        method: 'POST',
        headers: { 'x-gsb-admin-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: row.bot_id, account_sid: row.account_sid, phone_number: row.phone_number, label: row.label }),
      })
      if (r.ok) setMsg(`Saved ${row.name || `bot ${row.bot_id}`}.`)
      else { const d = await r.json().catch(() => ({})); setErr(d.error || 'Save failed.') }
    } catch { setErr('Network error.') } finally { setSavingId(null) }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-lg font-semibold text-slate-900">Telephony config</h1>
        <p className="mt-1 text-sm text-slate-500">GSB-internal. Enter the admin key to map each voice bot to its Twilio account.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (key) load(key) }} className="mt-5 flex gap-2">
          <input
            type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="GSB admin key" autoFocus
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
          />
          <button type="submit" disabled={busy || !key} className="rounded-lg bg-botscrew-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-60">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Telephony config</h1>
          <p className="text-sm text-slate-500">Map each voice bot to its Twilio account (SID) + inbound number. Powers recordings + the transfer ingest.</p>
        </div>
        {msg && <span className="text-xs font-medium text-emerald-700">{msg}</span>}
        {err && <span className="text-xs font-medium text-rose-600">{err}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Voice bot</th>
              <th className="px-3 py-2">Account SID</th>
              <th className="px-3 py-2">Inbound number</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bot_id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={['h-1.5 w-1.5 shrink-0 rounded-full', row.account_sid ? 'bg-emerald-500' : 'bg-slate-300'].join(' ')} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-700">{row.name || `Bot ${row.bot_id}`}</div>
                      <div className="text-[11px] text-slate-400">#{row.bot_id} · {row.voice_convs ?? 0} calls</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2"><input value={row.account_sid ?? ''} onChange={(e) => edit(row.bot_id, 'account_sid', e.target.value)} placeholder="AC…" className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs outline-none focus:border-botscrew-400" /></td>
                <td className="px-3 py-2"><input value={row.phone_number ?? ''} onChange={(e) => edit(row.bot_id, 'phone_number', e.target.value)} placeholder="+1…" className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-botscrew-400" /></td>
                <td className="px-3 py-2"><input value={row.label ?? ''} onChange={(e) => edit(row.bot_id, 'label', e.target.value)} placeholder="Project label" className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-botscrew-400" /></td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => save(row)} disabled={savingId === row.bot_id || !row.account_sid} className="rounded-md bg-botscrew-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-botscrew-600 disabled:opacity-50">
                    {savingId === row.bot_id ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Account SID is not a secret. The auth token stays in server env for now (multi-account via <code>TWILIO_ACCOUNTS</code>); encrypted per-account key entry is the Option-A finalization.
      </p>
    </div>
  )
}
