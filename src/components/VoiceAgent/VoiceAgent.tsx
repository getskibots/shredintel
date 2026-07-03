import { useEffect, useRef, useState } from 'react'
import { AudioLines, Mic, Square, Sparkles } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { brand } from '../../lib/chartTheme'
import { DEFAULT_VOICE_ID, profileFor, pickBrowserVoice } from '../../lib/voices'

/**
 * ShredIntel voice agent — talk to your resort's data and hear the answer while
 * the chart renders in sync. Pipeline: continuous speech recognition → /api/ask
 * (enrichment-aware, guarded SQL) → spoken answer (speech synthesis) + live viz,
 * then it resumes listening for follow-ups. Chrome/Edge (Web Speech API), HTTPS.
 *
 * (The ultra-low-latency OpenAI Realtime speech-to-speech is a planned upgrade;
 * this pipeline delivers the same talk-and-see experience reliably today.)
 */

type Mode = 'off' | 'listening' | 'thinking' | 'speaking'
interface ChartHint { type: 'bar' | 'line' | 'none'; x?: string; y?: string }
interface Turn { q: string; answer: string; chart: ChartHint | null; rows: Record<string, unknown>[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
const supported = !!SR && typeof window !== 'undefined' && 'speechSynthesis' in window

const MODE_LABEL: Record<Mode, string> = {
  off: '', listening: 'Listening…', thinking: 'Analyzing your data…', speaking: 'Speaking',
}
const MODE_COLOR: Record<Mode, string> = {
  off: brand.blue, listening: brand.blue, thinking: brand.gold, speaking: '#2E9B6B',
}

export function VoiceAgent({ botId }: { botId: number }) {
  const [mode, setMode] = useState<Mode>('off')
  const [interim, setInterim] = useState('')
  const [turn, setTurn] = useState<Turn | null>(null)
  const modeRef = useRef<Mode>('off')
  const activeRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)

  const voiceIdRef = useRef(DEFAULT_VOICE_ID)

  const setM = (m: Mode) => { modeRef.current = m; setMode(m) }

  useEffect(() => () => { stop() }, []) // cleanup on unmount

  function stop() {
    activeRef.current = false
    try { recogRef.current?.abort() } catch { /* noop */ }
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setInterim('')
    setM('off')
  }

  function start() {
    if (!supported) return
    try { voiceIdRef.current = localStorage.getItem(`shredintel_voice_${botId}`) || DEFAULT_VOICE_ID } catch { /* noop */ }
    activeRef.current = true
    setTurn(null)
    listen()
  }

  function listen() {
    if (!activeRef.current) return
    let final = ''
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let itr = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final += res[0].transcript
        else itr += res[0].transcript
      }
      setInterim((final + ' ' + itr).trim())
    }
    r.onerror = () => { /* handled by onend restart */ }
    r.onend = () => {
      if (final.trim()) askAndSpeak(final.trim())
      else if (activeRef.current && modeRef.current === 'listening') listen()
    }
    recogRef.current = r
    setInterim('')
    setM('listening')
    try { r.start() } catch { /* already started */ }
  }

  async function askAndSpeak(question: string) {
    if (!activeRef.current) return
    setInterim(question)
    setM('thinking')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, question, mode: 'voice', voiceId: voiceIdRef.current }),
      })
      const data = await res.json()
      if (!activeRef.current) return
      const answer = String(data.answer || (data.error ? `I hit a problem: ${data.error}` : 'I could not find an answer.'))
      setTurn({ q: question, answer, chart: data.chart ?? null, rows: Array.isArray(data.rows) ? data.rows : [] })
      speak(answer)
    } catch {
      if (!activeRef.current) return
      const msg = 'Sorry, I could not reach the data service.'
      setTurn({ q: question, answer: msg, chart: null, rows: [] })
      speak(msg)
    }
  }

  function speak(text: string) {
    if (!activeRef.current) return
    setM('speaking')
    try {
      const u = new SpeechSynthesisUtterance(text)
      const profile = profileFor(voiceIdRef.current)
      u.pitch = profile.pitch
      u.rate = profile.rate
      const chosen = pickBrowserVoice(profile, window.speechSynthesis.getVoices())
      if (chosen) u.voice = chosen
      u.onend = () => { if (activeRef.current) listen() }
      u.onerror = () => { if (activeRef.current) listen() }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch {
      if (activeRef.current) listen()
    }
  }

  if (!supported) {
    return (
      <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
        Voice needs Chrome or Edge — use the search bar above to type your question.
      </div>
    )
  }

  const active = mode !== 'off'
  const t = turn

  return (
    <div className="mx-auto mb-10 max-w-3xl">
      {!active ? (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full border border-botscrew-200 bg-botscrew-50 px-4 py-2 text-sm font-semibold text-botscrew-700 transition hover:bg-botscrew-100"
          >
            <AudioLines className="h-4 w-4" strokeWidth={2} /> Talk to ShredIntel
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span
              className={[
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white',
                mode === 'listening' || mode === 'speaking' ? 'animate-pulse' : '',
              ].join(' ')}
              style={{ backgroundColor: MODE_COLOR[mode] }}
              aria-hidden
            >
              <Mic className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-800">{MODE_LABEL[mode]}</div>
              <div className="truncate text-sm text-slate-500">
                {interim ? `“${interim}”` : 'Ask about your data — try “where am I losing revenue?”'}
              </div>
            </div>
            <button
              type="button"
              onClick={stop}
              aria-label="End voice session"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Square className="h-3.5 w-3.5" strokeWidth={2} /> End
            </button>
          </div>

          {t && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-botscrew-500" strokeWidth={2} /> ShredIntel
              </div>
              <p className="text-[15px] leading-relaxed text-slate-800">{t.answer}</p>
              {t.chart && t.chart.type !== 'none' && t.chart.x && t.chart.y && t.rows.length > 0 && (
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    {t.chart.type === 'line' ? (
                      <LineChart data={t.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <XAxis dataKey={t.chart.x} tick={{ fontSize: 11, fill: brand.muted }} hide={t.rows.length > 12} />
                        <YAxis tick={{ fontSize: 11, fill: brand.muted }} width={44} />
                        <Tooltip />
                        <Line type="monotone" dataKey={t.chart.y} stroke={brand.slate} strokeWidth={2} dot={false} />
                      </LineChart>
                    ) : (
                      <BarChart data={t.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <XAxis dataKey={t.chart.x} tick={{ fontSize: 11, fill: brand.muted }} hide={t.rows.length > 12} />
                        <YAxis tick={{ fontSize: 11, fill: brand.muted }} width={44} />
                        <Tooltip />
                        <Bar dataKey={t.chart.y} fill={brand.blue} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
