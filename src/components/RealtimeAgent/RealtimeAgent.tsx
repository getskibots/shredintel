import { useEffect, useRef, useState } from 'react'
import { Radio, Square, Sparkles, Loader2 } from 'lucide-react'
import { brand } from '../../lib/chartTheme'
import { DEFAULT_VOICE_ID } from '../../lib/voices'
import { focusSection } from '../../lib/focus'
import { VegaLiteChart } from '../VegaLiteChart'

/**
 * TRUE OpenAI Realtime speech-to-speech agent (gpt-realtime, WebRTC). Mic audio
 * streams to the model; it replies in the persona voice (ash/cedar/alloy) and
 * calls the query_shredintel tool → we run /api/ask (bot-scoped) → feed the
 * answer back → it speaks, while the chart renders and the section pulses.
 *
 * Controlled (active/onEnd), drop-in for VoiceAgent. NOTE: WebRTC + audio can't
 * be exercised in CI — this is built to the GA spec and needs a live mic test;
 * event/endpoint names may want a tweak on first run.
 */

type Status = 'connecting' | 'live' | 'error'
interface Panel { answer: string; vegaLite?: Record<string, unknown> | null; rows: Record<string, unknown>[] }

export function RealtimeAgent({ botId, active, onEnd }: { botId: number; active: boolean; onEnd: () => void }) {
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (active) connect()
    else teardown()
    return () => teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function teardown() {
    try { dcRef.current?.close() } catch { /* */ }
    try { pcRef.current?.close() } catch { /* */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* */ }
    pcRef.current = null; dcRef.current = null; streamRef.current = null
  }

  async function runTool(question: string): Promise<string> {
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, question, mode: 'voice' }),
      })
      const data = await res.json()
      setPanel({ answer: String(data.answer || ''), vegaLite: data.vegaLite ?? null, rows: Array.isArray(data.rows) ? data.rows : [] })
      focusSection(data.focus)
      return JSON.stringify({ answer: data.answer, error: data.error })
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : 'query failed' })
    }
  }

  async function connect() {
    setStatus('connecting'); setError(null); setPanel(null); setCaption('')
    try {
      const voiceId = (() => { try { return localStorage.getItem(`shredintel_voice_${botId}`) || DEFAULT_VOICE_ID } catch { return DEFAULT_VOICE_ID } })()
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
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
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
    // model wants data → run the tool, feed the result back, let it speak
    if (msg.type === 'response.function_call_arguments.done' && msg.name === 'query_shredintel' && dc) {
      const args = (() => { try { return JSON.parse(msg.arguments || '{}') } catch { return {} } })()
      ;(async () => {
        const output = await runTool(String(args.question || ''))
        dc.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: msg.call_id, output } }))
        dc.send(JSON.stringify({ type: 'response.create' }))
      })()
    }
    // live captions (event names vary by API version — capture any transcript)
    if (typeof msg.transcript === 'string' && msg.transcript.trim()) setCaption(msg.transcript.trim())
    else if (typeof msg.delta === 'string' && /transcript/i.test(msg.type || '')) setCaption((c) => (c + msg.delta).slice(-160))
  }

  if (!active) return null

  const orbColor = status === 'error' ? brand.gold : status === 'connecting' ? brand.muted : '#2E9B6B'
  return (
    <div className="mx-auto mb-10 max-w-3xl">
      <audio ref={audioRef} autoPlay className="hidden" />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: orbColor }} aria-hidden>
            {status === 'connecting' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Radio className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800">
              {status === 'connecting' ? 'Connecting realtime voice…' : status === 'error' ? 'Realtime voice unavailable' : 'Live — just talk'}
            </div>
            <div className="truncate text-sm text-slate-500">
              {error ? error : caption ? `“${caption}”` : 'Ask about your data — e.g. “where am I losing revenue?”'}
            </div>
          </div>
          <button type="button" onClick={onEnd} aria-label="End voice session" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            <Square className="h-3.5 w-3.5" strokeWidth={2} /> End
          </button>
        </div>

        {panel && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-botscrew-500" strokeWidth={2} /> ShredIntel
            </div>
            <p className="text-[15px] leading-relaxed text-slate-800">{panel.answer}</p>
            {panel.vegaLite && panel.rows.length > 0 && (
              <div className="mt-4"><VegaLiteChart spec={panel.vegaLite} rows={panel.rows} /></div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
