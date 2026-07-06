import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Sparkles } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { brand } from '../../lib/chartTheme'
import { DEFAULT_VOICE_ID, profileFor, pickBrowserVoice } from '../../lib/voices'
import { VegaLiteChart } from '../VegaLiteChart'
import { RichText } from '../shared'
import { focusSection } from '../../lib/focus'

/**
 * ShredIntel realtime voice session — controlled by the parent (opened from the
 * hero search bar). When `active`, it listens continuously → /api/ask (enrichment
 * -aware guarded SQL) → speaks the answer while the chart renders in sync, then
 * resumes for follow-ups. Chrome/Edge (Web Speech API), HTTPS.
 *
 * (Pipeline STT→brain→TTS today; OpenAI Realtime speech-to-speech is the upgrade.)
 */

type Mode = 'listening' | 'thinking' | 'speaking'
interface ChartHint { type: 'bar' | 'line' | 'none'; x?: string; y?: string }
interface Turn { q: string; answer: string; chart: ChartHint | null; vegaLite?: Record<string, unknown> | null; rows: Record<string, unknown>[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
const supported = !!SR && typeof window !== 'undefined' && 'speechSynthesis' in window

const MODE_LABEL: Record<Mode, string> = {
  listening: 'Listening…', thinking: 'Analyzing your data…', speaking: 'Speaking',
}
const MODE_COLOR: Record<Mode, string> = {
  listening: brand.blue, thinking: brand.gold, speaking: '#2E9B6B',
}

export function VoiceAgent({ botId, active, onEnd }: { botId: number; active: boolean; onEnd: () => void }) {
  const [mode, setMode] = useState<Mode>('listening')
  const [interim, setInterim] = useState('')
  const [turn, setTurn] = useState<Turn | null>(null)
  const modeRef = useRef<Mode>('listening')
  const runningRef = useRef(false)
  const voiceIdRef = useRef(DEFAULT_VOICE_ID)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)

  const setM = (m: Mode) => { modeRef.current = m; setMode(m) }

  useEffect(() => {
    if (active && supported) start()
    else stop()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function stop() {
    runningRef.current = false
    try { recogRef.current?.abort() } catch { /* noop */ }
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setInterim('')
  }

  function start() {
    try { voiceIdRef.current = localStorage.getItem(`shredintel_voice_${botId}`) || DEFAULT_VOICE_ID } catch { /* noop */ }
    runningRef.current = true
    setTurn(null)
    setM('listening')
    listen()
  }

  function listen() {
    if (!runningRef.current) return
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
      else if (runningRef.current && modeRef.current === 'listening') listen()
    }
    recogRef.current = r
    setInterim('')
    setM('listening')
    try { r.start() } catch { /* already started */ }
  }

  async function askAndSpeak(question: string) {
    if (!runningRef.current) return
    setInterim(question)
    setM('thinking')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, question, mode: 'voice', voiceId: voiceIdRef.current }),
      })
      const data = await res.json()
      if (!runningRef.current) return
      const answer = String(data.answer || (data.error ? `I hit a problem: ${data.error}` : 'I could not find an answer.'))
      setTurn({ q: question, answer, chart: data.chart ?? null, vegaLite: data.vegaLite ?? null, rows: Array.isArray(data.rows) ? data.rows : [] })
      focusSection(data.focus)
      speak(answer)
    } catch {
      if (!runningRef.current) return
      const msg = 'Sorry, I could not reach the data service.'
      setTurn({ q: question, answer: msg, chart: null, rows: [] })
      speak(msg)
    }
  }

  function speak(text: string) {
    if (!runningRef.current) return
    setM('speaking')
    try {
      const u = new SpeechSynthesisUtterance(text)
      const profile = profileFor(voiceIdRef.current)
      u.pitch = profile.pitch
      u.rate = profile.rate
      const chosen = pickBrowserVoice(profile, window.speechSynthesis.getVoices())
      if (chosen) u.voice = chosen
      u.onend = () => { if (runningRef.current) listen() }
      u.onerror = () => { if (runningRef.current) listen() }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch {
      if (runningRef.current) listen()
    }
  }

  if (!active) return null

  if (!supported) {
    return (
      <div className="mx-auto mb-10 max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
        Realtime voice needs Chrome or Edge — type your question above instead.{' '}
        <button type="button" onClick={onEnd} className="font-semibold text-botscrew-600">Close</button>
      </div>
    )
  }

  const t = turn
  return (
    <div className="mx-auto mb-10 max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span
            className={['flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white animate-pulse'].join(' ')}
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
            onClick={onEnd}
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
            <p className="text-[15px] leading-relaxed text-slate-800"><RichText text={t.answer} /></p>
            {t.vegaLite && t.rows.length > 0 ? (
              <div className="mt-4">
                <VegaLiteChart spec={t.vegaLite} rows={t.rows} />
              </div>
            ) : t.chart && t.chart.type !== 'none' && t.chart.x && t.chart.y && t.rows.length > 0 ? (
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
