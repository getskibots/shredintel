import { useEffect, useState } from 'react'
import { X, Loader2, ChevronRight } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { sentimentColors } from '../../lib/chartTheme'
import { DRILL_DIMENSIONS, humanLabel, type DrillPayload } from '../../lib/drill'

/**
 * Drill-down: any chart mark / sliver → the matching conversations → the actual
 * transcript. Accepts the universal DrillPayload (any combination of section /
 * pinchpoint / sentiment / funnel_stage / topic / day, AND-combined). The legacy
 * single-dimension `filter` prop is still accepted and normalized to a payload,
 * so existing callers keep working.
 *
 * Conversation list comes from report.conversation_time (the resort-local time-
 * spine — a superset carrying every drill dimension PLUS started_local/duration,
 * so each conversation shows WHEN it happened), anon-readable; the transcript
 * comes from the bot-scoped, PII-scrubbed /api/transcript.
 */

interface ConvRow { bot_id: number; conversation_id: number; topic: string | null; sentiment: string | null; day: string; started_local: string | null; duration_sec: number | null }
interface Msg { sender: string; text: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// started_local is a tz-less resort-local wall-clock ("2026-07-05T13:18:…") — format
// from the string parts so no browser-timezone shift creeps in.
function fmtStamp(s: string | null, withYear = false): string {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s)
  if (!m) return ''
  const [, y, mo, d, hh, mm] = m
  let h = parseInt(hh, 10)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${MONTHS[+mo - 1]} ${+d}${withYear ? ', ' + y : ''} · ${h}:${mm} ${ap}`
}
function fmtDur(sec: number | null): string {
  if (!sec || sec < 1) return ''
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  return `${(sec / 3600).toFixed(1)} h`
}

type LegacyFilter = { dim: 'section' | 'pinchpoint' | 'sentiment' | 'stage'; value: string; label: string }

const sentColor = (s: string | null): string => {
  const k = (s || '').toLowerCase() as keyof typeof sentimentColors
  return sentimentColors[k] || '#94A3B8'
}

const LIST_CAP = 60

/** Normalize the legacy {dim,value} filter to a DrillPayload (stage → funnel_stage). */
function legacyToPayload(f: LegacyFilter, botId: number, range?: { from: string; to: string }): DrillPayload {
  const p: DrillPayload = { botId, from: range?.from, to: range?.to }
  if (f.dim === 'stage') p.funnel_stage = f.value
  else p[f.dim] = f.value
  return p
}

export function ConversationExplorer({
  botId,
  filter,
  payload,
  range,
  onClose,
}: {
  botId: number
  /** Legacy single-dimension entry point (still supported). */
  filter?: LegacyFilter
  /** Universal multi-dimension drill payload (preferred — from chart clicks). */
  payload?: DrillPayload
  /** Scope to the same window as the dashboard/AI. Omit for all-time. */
  range?: { from: string; to: string }
  onClose: () => void
}) {
  const p: DrillPayload = payload ?? legacyToPayload(filter as LegacyFilter, botId, range)
  const lockedSentiment = p.sentiment // set when the drill itself is a sentiment
  const primaryDim = DRILL_DIMENSIONS.find((d) => p[d] != null)
  const eyebrow = primaryDim ? humanLabel(primaryDim) : 'Conversations'
  const title = filter?.label ?? (primaryDim ? String(p[primaryDim]) : 'Conversations')
  // Active dims beyond the primary, shown as a sub-line so multi-filter drills read clearly.
  const extraFilters = DRILL_DIMENSIONS.filter((d) => d !== primaryDim && p[d] != null)
    .map((d) => `${humanLabel(d)}: ${p[d]}`)

  const [rows, setRows] = useState<ConvRow[] | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [sentFilter, setSentFilter] = useState<'all' | 'Positive' | 'Neutral' | 'Negative'>('all')
  const [openCid, setOpenCid] = useState<number | null>(null)
  const [transcript, setTranscript] = useState<Msg[] | null>(null)
  const [loadingT, setLoadingT] = useState(false)

  const from = p.from ?? range?.from
  const to = p.to ?? range?.to

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      if (!sb) { setRows([]); setCount(0); return }
      // conversation_time is the local time-spine superset — every drill dimension
      // PLUS started_local/duration, so each conversation shows when it happened.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = sb
        .schema('report')
        .from('conversation_time')
        .select('bot_id, conversation_id, topic, sentiment, day, started_local, duration_sec', { count: 'exact' })
        .eq('bot_id', p.botId)
        .eq('substantive', true)
      if (p.section) q = q.ilike('section', p.section)
      if (p.pinchpoint) q = q.ilike('pinchpoint', p.pinchpoint)
      if (p.funnel_stage) q = q.eq('funnel_stage', p.funnel_stage)
      if (p.topic) q = q.ilike('topic', `%${p.topic}%`)
      if (p.day) q = q.eq('day', p.day)
      if (from && to) q = q.gte('day', from).lte('day', to)
      // Sentiment: a locked sentiment (drill target) wins; otherwise the toggle.
      if (lockedSentiment) q = q.eq('sentiment', lockedSentiment)
      else if (sentFilter !== 'all') q = q.eq('sentiment', sentFilter)

      const { data, count: total } = await q.order('started_at', { ascending: false }).limit(LIST_CAP)
      if (!cancelled) {
        setRows((data as ConvRow[]) ?? [])
        setCount(total ?? (data?.length ?? 0))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.botId, p.section, p.pinchpoint, p.sentiment, p.funnel_stage, p.topic, p.day, from, to, sentFilter])

  async function openConv(cid: number) {
    if (openCid === cid) { setOpenCid(null); setTranscript(null); return }
    setOpenCid(cid); setTranscript(null); setLoadingT(true)
    try {
      const res = await fetch(`/api/transcript?botId=${botId}&cid=${cid}`)
      const data = await res.json()
      setTranscript(Array.isArray(data.messages) ? data.messages : [])
    } catch {
      setTranscript([])
    } finally {
      setLoadingT(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{eyebrow}</div>
            <div className="text-base font-semibold text-slate-900">
              {title}
              {count != null ? <span className="ml-2 text-sm font-normal text-slate-400">{count} conversations</span> : null}
            </div>
            {extraFilters.length > 0 && (
              <div className="mt-0.5 text-[11px] text-slate-400">{extraFilters.join(' · ')}</div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!lockedSentiment && (
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-2">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">Sentiment</span>
            {(['all', 'Positive', 'Neutral', 'Negative'] as const).map((s) => {
              const active = sentFilter === s
              const color = s === 'all' ? '#475569' : sentColor(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentFilter(s)}
                  className="rounded-full px-2.5 py-1 text-xs font-medium transition"
                  style={active ? { backgroundColor: `${color}1f`, color } : { color: '#64748B' }}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              )
            })}
          </div>
        )}

        <div className="overflow-y-auto p-4">
          {rows === null ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No conversations for this filter in the selected range.</div>
          ) : (
            <>
            {count != null && count > rows.length && (
              <p className="mb-2 px-1 text-xs text-slate-400">Showing the most recent {rows.length} of {count} conversations.</p>
            )}
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.conversation_id} className="rounded-lg border border-slate-200">
                  <button
                    onClick={() => openConv(r.conversation_id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50"
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition ${openCid === r.conversation_id ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {r.topic || `Conversation ${r.conversation_id}`}
                    </span>
                    {r.started_local && (
                      <span className="hidden shrink-0 text-[11px] tabular-nums text-slate-400 sm:inline" title={fmtStamp(r.started_local, true)}>
                        {fmtStamp(r.started_local)}
                      </span>
                    )}
                    {r.sentiment && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `${sentColor(r.sentiment)}1f`, color: sentColor(r.sentiment) }}
                      >
                        {r.sentiment}
                      </span>
                    )}
                  </button>
                  {openCid === r.conversation_id && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <span className="text-[11px] font-medium text-slate-500">
                          {r.started_local ? fmtStamp(r.started_local, true) : `Conversation ${r.conversation_id}`}
                          {fmtDur(r.duration_sec) ? <span className="text-slate-400"> · {fmtDur(r.duration_sec)}</span> : null}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          Open full conversation
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Soon</span>
                        </span>
                      </div>
                      {loadingT ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcript…
                        </div>
                      ) : transcript && transcript.length ? (
                        <div className="space-y-2">
                          {transcript.map((m, i) => (
                            <div key={i} className={`text-sm leading-relaxed ${m.sender === 'user' ? 'text-slate-800' : 'text-slate-500'}`}>
                              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.sender}</span>
                              {m.text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">No transcript available.</div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
