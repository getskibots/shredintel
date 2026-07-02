import { useState, type ReactNode, type FormEvent } from 'react'
import logoUrl from '../../assets/logo.png'

/**
 * Soft password gate for the standalone site (analytics.getskibots.com).
 *
 * This is a client-side gate: it keeps casual visitors out of the dashboard
 * UI. It is NOT a hard security boundary — the Supabase anon key ships in the
 * bundle, so true data protection must come from Supabase RLS (or Vercel's
 * edge Password Protection). Treat this as "keep randoms out", not a vault.
 *
 * NOTE (2026-07-02): the embed surface (public/embed.js, embed-test.html) and
 * the old ?embed=1 gate-exemption were removed. That exemption was a bypass —
 * anyone could append ?embed=1 to a dashboard URL and skip the gate. Embed
 * mode is now gated like every other route. When the Botscrew iframe is wired
 * up for real, reintroduce embed access behind proper host-side auth, not a
 * blanket skip.
 *
 * The password itself never lives in the bundle — only its SHA-256 hash.
 * To change it, run:
 *   node -e 'console.log(require("crypto").createHash("sha256").update("NEWPASS").digest("hex"))'
 * and paste the result into PASSWORD_HASH below.
 */
const PASSWORD_HASH = '684e789c00a440e197e44ac882173a459345b0e793d3899313a07649211e361e'
const STORAGE_KEY = 'shredintel_gate_v1'

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function PasswordGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === PASSWORD_HASH
    } catch {
      return false
    }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  if (authed) return <>{children}</>

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value || checking) return
    setChecking(true)
    setError(false)
    const hash = await sha256Hex(value)
    if (hash === PASSWORD_HASH) {
      try {
        localStorage.setItem(STORAGE_KEY, PASSWORD_HASH)
      } catch {
        /* private mode — session-only access is fine */
      }
      setAuthed(true)
    } else {
      setError(true)
      setValue('')
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-botscrew-500">
            <img src={logoUrl} alt="Get Ski Bots" className="h-auto w-11" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            GetSkiBots Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the password to continue.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6">
          <label htmlFor="gate-password" className="sr-only">
            Password
          </label>
          <input
            id="gate-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(false)
            }}
            placeholder="Password"
            aria-invalid={error}
            className={[
              'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition',
              'placeholder:text-slate-400 focus:ring-2',
              error
                ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                : 'border-slate-200 focus:border-botscrew-400 focus:ring-botscrew-100',
            ].join(' ')}
          />

          {error && (
            <p className="mt-2 text-xs text-rose-600">
              Incorrect password. Try again.
            </p>
          )}

          <button
            type="submit"
            disabled={checking || !value}
            className="mt-4 w-full rounded-lg bg-botscrew-500 py-2.5 text-sm font-semibold text-white transition hover:bg-botscrew-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Authorized access only · Get Ski Bots
        </p>
      </div>
    </div>
  )
}
