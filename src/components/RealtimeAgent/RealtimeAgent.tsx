import { useEffect, useRef, useState } from 'react'
import { Square, Sparkles, Loader2, Bookmark, Check, Download, Mail, Copy, Pause, Play } from 'lucide-react'
import { DEFAULT_VOICE_ID, profileFor } from '../../lib/voices'
import { ReportCardView } from '../ReportCards'
import { ConversationExplorer } from '../ConversationExplorer'
import {
  saveReport,
  newReportId,
  downloadReport,
  mailtoForReport,
  copyReportSummary,
  type ReportCard,
  type DrillFilter,
  type SavedReport,
} from '../../lib/savedReports'

/**
 * Modern realtime Voice AI overlay (OpenAI gpt-realtime, WebRTC speech-to-speech)
 * rendered as a FULL-SCREEN TAKEOVER. The REPORT is the main content: each spoken
 * answer + chart appends as a card the manager can read, drill into (real
 * conversations), and keep asking about — hands-free. Voice controls live in a
 * bottom dock (activity indicator + Pause/Resume + End); Save / Share up top.
 *
 * Controlled (active/onEnd). WebRTC/audio can't run in CI — GA-spec; the
 * version-sensitive bits are the SDP endpoint (/v1/realtime/calls) and the
 * function-call event name.
 */

type Status = 'connecting' | 'live' | 'error'

/** Animated voice-activity equalizer (replaces the old static orb). */
function Equalizer({ active, size = 'md' }: { active: boolean; size?: 'sm' | 'md' }) {
  const bars = [0, 1, 2, 3, 4]
  const wrap = size === 'sm' ? 'h-4 gap-1' : 'h-9 gap-1.5'
  const bar = size === 'sm' ? 'w-1' : 'w-1.5'
  return (
    <div className={`flex items-end ${wrap}`} aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className={`${bar} rounded-full`}
          style={{
            height: '100%',
            background: active ? '#2E9B6B' : '#CBD5E1',
            transformOrigin: 'bottom',
            transform: active ? undefined : 'scaleY(0.3)',
            animation: active ? `shredintel-eq 0.9s ease-in-out ${i * 0.11}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function RealtimeAgent({ botId, active, onEnd }: { botId: number; active: boolean; onEnd: () => void }) {
  const [status, setStatus] = useState<Status>('connecting')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [cards, setCards] = useState<ReportCard[]>([])
  const [drill, setDrill] = useState<DrillFilter | null>(null)
  const [persona, setPersona] = useState(profileFor(DEFAULT_VOICE_ID).name)
  const [saved, setSaved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const idRef = useRef(newReportId())
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (active) connect()
    else teardown()
    return () => teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [cards.length])

  function teardown() {
    try { dcRef.current?.close() } catch { /* */ }
    try { pcRef.current?.close() } catch { /* */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* */ }
    pcRef.current = null; dcRef.current = null; streamRef.current = null
  }

  /** Pause = hold the mic (stop listening) and mute playback; Resume flips back. */
  function togglePause() {
    const next = !paused
    setPaused(next)
    try { streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next }) } catch { /* */ }
    try { if (audioRef.current) audioRef.current.muted = next } catch { /* */ }
  }

  function currentReport(): SavedReport {
    const title = (cards.find((c) => c.question)?.question || 'Voice report').slice(0, 60)
    return { id: idRef.current, botId, persona, title, createdAt: Date.now(), cards }
  }

  function handleSave() {
    if (!cards.length) return
    saveReport(currentReport())
    setSaved(true)
  }

  async function handleCopy() {
    if (!cards.length) return
    const ok = await copyReportSummary(currentReport())
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
  }

  async function runTool(question: string): Promise<string> {
    setBusy(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, question, mode: 'voice' }),
      })
      const data = await res.json()
      const d = data.drill && ['section', 'pinchpoint', 'sentiment'].includes(data.drill.dimension) && data.drill.value
        ? { dim: data.drill.dimension as DrillFilter['dim'], value: String(data.drill.value), label: String(data.drill.label || data.drill.value) }
        : null
      setCards((c) => [...c, {
        question, answer: String(data.answer || ''),
        vegaLite: data.vegaLite ?? null,
        rows: Array.isArray(data.rows) ? data.rows : [],
        drill: d,
      }])
      setSaved(false)
      return JSON.stringify({ answer: data.answer, error: data.error })
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : 'query failed' })
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    setStatus('connecting'); setError(null); setCards([]); setCaption(''); setSaved(false); setDrill(null); setPaused(false)
    idRef.current = newReportId()
    try {
      const voiceId = DEFAULT_VOICE_ID
      setPersona(profileFor(voiceId).name)
      const sess = await (await fetch('/api/realtime-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId }),
      })).json()
      const token = sess?.value
      if (!token) throw new Error(sess?.error?.message || 'could not start a realtime session')

      const pc = new RTCPeerConnection()
      pcRef.current = pc
      pc.ontrack = (e) => { if (audioRef.current) audioRef.current.srcObject = e.streams[0] }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = onEvent

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sess.model || 'gpt-realtime')}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp,
      })
      const answerSdp = await sdpRes.text()
      if (!sdpRes.ok) throw new Error(`realtime handshake failed (${sdpRes.status})`)
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      setStatus('live')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'realtime unavailable')
      setStatus('error')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onEvent(ev: MessageEvent) {
    let msg: any
    try { msg = JSON.parse(ev.data) } catch { return }
    const dc = dcRef.current

    if (msg.type === 'response.function_call_arguments.done' && dc) {
      const args = (() => { try { return JSON.parse(msg.arguments || '{}') } catch { return {} } })()

      if (msg.name === 'query_shredintel') {
        ;(async () => {
          const output = await runTool(String(args.question || ''))
          dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output } }))
          dc.send(JSON.stringify({ type: 'response.create' }))
        })()
      } else if (msg.name === 'show_conversations') {
        const dim = (['section', 'pinchpoint', 'sentiment'] as const).includes(args.dimension) ? args.dimension : 'section'
        const value = String(args.value || '').trim()
        if (value) setDrill({ dim, value, label: String(args.label || value) })
        dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output: JSON.stringify({ ok: !!value, note: value ? 'Opened the matching conversations on the manager’s screen.' : 'No value provided.' }) } }))
        dc.send(JSON.stringify({ type: 'response.create' }))
      }
    }

    if (typeof msg.transcript === 'string' && msg.transcript.trim()) setCaption(msg.transcript.trim())
    else if (typeof msg.delta === 'string' && /transcript/i.test(msg.type || '')) setCaption((c) => (c + msg.delta).slice(-180))
  }

  if (!active) return null

  const eqActive = status === 'live' && !paused
  const dockLabel = status === 'connecting' ? 'Connecting…'
    : status === 'error' ? 'Offline'
    : paused ? 'Paused'
    : busy ? 'Thinking…' : 'Listening'
  const emptyStatus = status === 'connecting' ? 'Connecting…'
    : status === 'error' ? 'Voice unavailable'
    : paused ? 'Paused' : busy ? 'Analyzing…' : 'Listening — just talk'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <audio ref={audioRef} autoPlay className="hidden" />

      {/* Top bar — report actions */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5 md:px-6">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-botscrew-500" strokeWidth={2} />
          <span className="text-sm font-semibold text-slate-800">ShredIntel</span>
          <span className="rounded-full bg-botscrew-50 px-2 py-0.5 text-[11px] font-medium text-botscrew-700">{persona}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSave} disabled={!cards.length}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            {saved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Bookmark className="h-3.5 w-3.5" />} {saved ? 'Saved' : 'Save'}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShareOpen((v) => !v)} disabled={!cards.length}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
              Share
            </button>
            {shareOpen && cards.length > 0 && (
              <div className="absolute right-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button onClick={() => { downloadReport(currentReport()); setShareOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                  <Download className="h-3.5 w-3.5 text-slate-400" /> Download report
                </button>
                <a href={mailtoForReport(currentReport())} onClick={() => setShareOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> Email to team
                </a>
                <button onClick={() => { handleCopy(); setShareOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />} Copy summary
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report — the main content */}
      <div className="flex-1 overflow-y-auto" onClick={() => shareOpen && setShareOpen(false)}>
        <div className="mx-auto max-w-3xl px-4 py-8 pb-36 md:px-6">
          {cards.length === 0 ? (
            <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
              {status === 'connecting'
                ? <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                : <Equalizer active={eqActive} size="md" />}
              <div className="mt-5 text-base font-semibold text-slate-800">{emptyStatus}</div>
              <div className="mt-1.5 max-w-md text-sm text-slate-500">
                {error ? error : 'Ask anything about your resort — I’ll answer out loud, chart it here, and pull up the real conversations when you ask.'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cards.map((c, i) => (
                <ReportCardView key={i} card={c} onDrill={setDrill} />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* Voice control dock — activate / pause / stop */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2 px-4">
        {caption && (
          <div className="max-w-xl rounded-full bg-slate-900/80 px-4 py-1.5 text-center text-xs text-white shadow-sm">“{caption}”</div>
        )}
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 py-2 pl-4 pr-2 shadow-lg backdrop-blur">
          <Equalizer active={eqActive} size="sm" />
          <span className="min-w-[64px] text-xs font-medium text-slate-600">{dockLabel}</span>
          <button type="button" onClick={togglePause} disabled={status !== 'live'}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">
            {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
          </button>
          <button type="button" onClick={onEnd} aria-label="End voice session"
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600">
            <Square className="h-3.5 w-3.5" strokeWidth={2} /> End
          </button>
        </div>
      </div>

      {drill && <ConversationExplorer botId={botId} filter={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}
