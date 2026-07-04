import { useEffect, useRef, useState } from 'react'
import { Radio, Square, Sparkles, Loader2, Bookmark, Check, Download, Mail, Copy } from 'lucide-react'
import { brand } from '../../lib/chartTheme'
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
 * TRUE OpenAI Realtime speech-to-speech agent (gpt-realtime, WebRTC), rendered
 * as a FULL-SCREEN TAKEOVER: talk, and ShredIntel builds a live report on screen
 * — each answer + chart is appended as a card. The manager can drill into the
 * real conversations behind any slice (by voice via the show_conversations tool,
 * or by clicking a card), and Save / Share the whole session.
 *
 * Controlled (active/onEnd). WebRTC/audio can't run in CI — GA-spec; if a live
 * run needs tweaks, the version-sensitive bits are the SDP endpoint
 * (/v1/realtime/calls) and the function-call event name.
 */

type Status = 'connecting' | 'live' | 'error'

export function RealtimeAgent({ botId, active, onEnd }: { botId: number; active: boolean; onEnd: () => void }) {
  const [status, setStatus] = useState<Status>('connecting')
  const [busy, setBusy] = useState(false)
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
    setStatus('connecting'); setError(null); setCards([]); setCaption(''); setSaved(false); setDrill(null)
    idRef.current = newReportId()
    try {
      // Persona selector was removed — Old Man Winter is the default voice.
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

  const orbColor = status === 'error' ? brand.gold : status === 'connecting' ? brand.muted : busy ? brand.gold : '#2E9B6B'
  const statusText = status === 'connecting' ? 'Connecting realtime voice…'
    : status === 'error' ? 'Realtime voice unavailable'
    : busy ? 'Analyzing your data…' : 'Live — just talk'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <audio ref={audioRef} autoPlay className="hidden" />

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
          <button type="button" onClick={onEnd} aria-label="End voice session"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            <Square className="h-3.5 w-3.5" strokeWidth={2} /> End
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" onClick={() => shareOpen && setShareOpen(false)}>
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
          <div className="flex flex-col items-center py-4 text-center">
            <span className={`flex h-20 w-20 items-center justify-center rounded-full text-white ${status === 'live' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: orbColor }} aria-hidden>
              {status === 'connecting' ? <Loader2 className="h-8 w-8 animate-spin" /> : <Radio className="h-8 w-8" />}
            </span>
            <div className="mt-4 text-base font-semibold text-slate-800">{statusText}</div>
            <div className="mt-1 max-w-lg text-sm text-slate-500">
              {error ? error : caption ? `“${caption}”` : 'Ask anything about your resort — I’ll answer out loud, chart it, and you can say “show me those conversations” to read the real transcripts.'}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {cards.map((c, i) => (
              <ReportCardView key={i} card={c} onDrill={setDrill} />
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      {drill && <ConversationExplorer botId={botId} filter={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}
