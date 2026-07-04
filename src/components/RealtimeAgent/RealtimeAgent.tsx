import { useEffect, useRef, useState } from 'react'
import { Square, Sparkles, Loader2, Bookmark, Check, Download, Mail, Copy, ArrowLeft } from 'lucide-react'
import { DEFAULT_VOICE_ID, profileFor } from '../../lib/voices'
import { PeriodPicker } from '../PeriodPicker'
import { ShreddingOverlay } from '../ShreddingOverlay'
import { ReportCardView } from '../ReportCards'
import { ConversationExplorer } from '../ConversationExplorer'
import type { PeriodSelection } from '../../lib/period'
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
 * rendered as a FULL-SCREEN TAKEOVER. A brand orb (subtle gradient mountains) is
 * the voice's face — it breathes while listening and runs a scanner shimmer while
 * analyzing/building the report. The REPORT builds beneath it: each answer + chart
 * is a card the manager can read, drill into, and keep asking about, hands-free.
 * End STOPS the voice but keeps the report up; "Back to dashboard" closes it.
 *
 * Controlled (active/onEnd). WebRTC/audio can't run in CI — GA-spec; the
 * version-sensitive bits are the SDP endpoint (/v1/realtime/calls) and the
 * function-call event name.
 */

type Status = 'connecting' | 'live' | 'error'
type OrbState = 'connecting' | 'listening' | 'analyzing' | 'ended'

/** The voice's face — a circular orb with a super-subtle mountain gradient. */
function VoiceOrb({ state }: { state: OrbState }) {
  const analyzing = state === 'analyzing'
  const listening = state === 'listening'
  return (
    <div className="relative h-28 w-28">
      {/* scanner ring — spins while analyzing the data */}
      {analyzing && (
        <div
          className="absolute -inset-1.5 animate-spin rounded-full [animation-duration:1.2s]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(33,130,191,0.45) 70deg, transparent 150deg)' }}
        />
      )}
      {/* soft glow — breathes while listening */}
      {listening && (
        <div className="absolute -inset-2 animate-[shredintel-breathe_2.8s_ease-in-out_infinite] rounded-full bg-botscrew-200/40 blur-xl" />
      )}
      {/* orb body */}
      <div
        className={`absolute inset-0 overflow-hidden rounded-full shadow-sm ring-1 ring-white/70 ${listening ? 'animate-[shredintel-breathe_2.8s_ease-in-out_infinite]' : ''} ${state === 'ended' ? 'opacity-60 saturate-50' : ''}`}
        style={{ background: 'radial-gradient(125% 125% at 50% 15%, #F2F8FC 0%, #DEEDF8 45%, #C9E0F1 100%)' }}
      >
        <svg viewBox="0 0 112 112" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="orbMtn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2182BF" stopOpacity="0.16" />
              <stop offset="1" stopColor="#2182BF" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M0 74 L24 50 L42 64 L62 38 L82 62 L112 42 L112 112 L0 112 Z" fill="url(#orbMtn)" />
          <path d="M0 90 L32 66 L56 84 L84 60 L112 82 L112 112 L0 112 Z" fill="#2182BF" fillOpacity="0.11" />
        </svg>
        {/* shimmer sweep across the mountains — reads as "scanning" */}
        {analyzing && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.6) 50%, transparent 65%)', animation: 'shredintel-sweep 1.2s linear infinite' }}
          />
        )}
      </div>
      {state === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-botscrew-500/70" />
        </div>
      )}
      {state === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-500/80" strokeWidth={2.5} />
        </div>
      )}
    </div>
  )
}

export function RealtimeAgent({ botId, range, selection, onSelectionChange, shredding, active, onEnd }: {
  botId: number
  range?: { from: string; to: string; label: string }
  selection?: PeriodSelection
  onSelectionChange?: (next: PeriodSelection) => void
  shredding?: boolean
  active: boolean
  onEnd: () => void
}) {
  const [status, setStatus] = useState<Status>('connecting')
  const [busy, setBusy] = useState(false)
  const [ended, setEnded] = useState(false)
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
  // The data channel is wired once at connect, so runTool must read the CURRENT
  // range via a ref — otherwise changing the date mid-session would be ignored.
  const rangeRef = useRef(range)
  useEffect(() => { rangeRef.current = range }, [range])

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

  /** End = stop the voice session, but keep the report on screen. */
  function endVoice() {
    teardown()
    setEnded(true)
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
        body: JSON.stringify({ botId, question, mode: 'voice', from: rangeRef.current?.from, to: rangeRef.current?.to }),
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
    setStatus('connecting'); setError(null); setCards([]); setCaption(''); setSaved(false); setDrill(null); setEnded(false)
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

  const orbState: OrbState = status === 'connecting' ? 'connecting'
    : ended || status === 'error' ? 'ended'
    : busy ? 'analyzing'
    : 'listening'

  const statusTitle = status === 'connecting' ? 'Connecting…'
    : status === 'error' ? 'Voice unavailable'
    : ended ? 'Session ended'
    : busy ? 'Thinking…'
    : 'Listening — just talk'

  // The line under the orb: the assistant's live caption while it speaks, else a hint.
  const statusLine = error ? error
    : caption && !ended ? `“${caption}”`
    : ended ? 'Your report is below — save or share it, or head back to the dashboard.'
    : busy ? 'Reading the conversations and charting the answer.'
    : `Ask anything about your resort — I’ll answer out loud and chart it here, for ${range?.label ?? 'the selected range'}.`

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

      {/* Date range — change the window mid-conversation; the AI's next answer uses it */}
      {selection && onSelectionChange && (
        <div className="flex items-center justify-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <span className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:inline">Answers cover</span>
          <PeriodPicker value={selection} onChange={onSelectionChange} align="start" />
        </div>
      )}

      {/* Orb cluster — the voice's face + its state + End, all inline; report builds downward.
          The "shredding" scan sweeps this region on a date change (same as the dashboard). */}
      <div className="relative min-h-0 flex-1">
        <ShreddingOverlay active={!!shredding} label={range?.label} />
        <div className="h-full overflow-y-auto" onClick={() => shareOpen && setShareOpen(false)}>
        <div className="mx-auto max-w-3xl px-4 pt-12 pb-16 md:px-6">
          <div className="flex flex-col items-center text-center">
            <VoiceOrb state={orbState} />
            <div className="mt-5 text-lg font-semibold text-slate-800">{statusTitle}</div>
            <div className={`mt-1.5 min-h-[2.75rem] max-w-md text-sm ${caption && !ended ? 'font-medium text-slate-600' : 'text-slate-500'}`}>
              {statusLine}
            </div>
            <div className="mt-4">
              {ended ? (
                <button type="button" onClick={onEnd}
                  className="inline-flex items-center gap-1.5 rounded-full bg-botscrew-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-botscrew-600">
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} /> Back to dashboard
                </button>
              ) : (
                <button type="button" onClick={endVoice} disabled={status === 'connecting'} aria-label="End voice session"
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40">
                  <Square className="h-3.5 w-3.5" strokeWidth={2} /> End
                </button>
              )}
            </div>
          </div>

          {cards.length > 0 && (
            <div className="mt-8 space-y-4">
              {cards.map((c, i) => (
                <ReportCardView key={i} card={c} onDrill={setDrill} />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
        </div>
      </div>

      {drill && <ConversationExplorer botId={botId} range={range} filter={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}
