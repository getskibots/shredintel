import { useRef, useState } from 'react'
import { X, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react'
import type { Branding } from '../../data/useBranding'

/**
 * Discreet per-bot branding editor (popover). Upload a logo + background image
 * and tune the overlay; everything saves to /api/branding for this bot_id and
 * shows on both the chat hero and the voice overlay. Behind the app gate.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function BrandingEditor({
  botId,
  branding,
  onSaved,
  onClose,
}: {
  botId: number
  branding: Branding | null
  onSaved: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overlay, setOverlay] = useState(branding?.overlay ?? 0.6)
  const logoInput = useRef<HTMLInputElement>(null)
  const bgInput = useRef<HTMLInputElement>(null)

  async function upload(kind: 'logo' | 'background', file: File) {
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    setError(null)
    setBusy(kind)
    try {
      const dataBase64 = await fileToDataUrl(file)
      const res = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, kind, mime: file.type, dataBase64 }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `upload failed (${res.status})`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function remove(kind: 'logo' | 'background') {
    setBusy(kind)
    try {
      await fetch('/api/branding', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, kind }),
      })
      onSaved()
    } finally {
      setBusy(null)
    }
  }

  async function persistOverlay(v: number) {
    try {
      await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, overlay: v }),
      })
      onSaved()
    } catch { /* non-fatal */ }
  }

  const Row = ({ kind, label, current }: { kind: 'logo' | 'background'; label: string; current?: string }) => {
    const ref = kind === 'logo' ? logoInput : bgInput
    return (
      <div className="mb-3">
        <div className="mb-1 text-[11px] font-medium text-slate-500">{label}</div>
        <div className="flex items-center gap-2">
          {current ? (
            <img src={current} alt="" className="h-9 w-9 shrink-0 rounded-md border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-300">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy === kind}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-600 transition hover:border-botscrew-400 hover:text-slate-900"
          >
            {busy === kind ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</span>
            ) : current ? 'Replace image' : `Upload ${kind}`}
          </button>
          {current && (
            <button type="button" onClick={() => remove(kind)} disabled={busy === kind} aria-label={`Remove ${kind}`}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(kind, f); e.target.value = '' }}
        />
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
      <div className="mb-0.5 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Branding</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">Shown on the chat hero and the voice overlay. Saves for this bot.</p>

      <Row kind="logo" label="Logo" current={branding?.logoUrl} />
      <Row kind="background" label="Background image" current={branding?.backgroundUrl} />

      <div className="mt-1">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
          <span>Overlay strength</span>
          <span className="tabular-nums text-slate-400">{Math.round(overlay * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.05} value={overlay}
          onChange={(e) => setOverlay(Number(e.target.value))}
          onMouseUp={() => persistOverlay(overlay)}
          onTouchEnd={() => persistOverlay(overlay)}
          className="w-full"
        />
      </div>

      {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
