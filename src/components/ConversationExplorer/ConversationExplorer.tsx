import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ChevronRight, Globe, Bot, User, MapPin } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { sentimentColors } from '../../lib/chartTheme'
import { LAYER_COLOR, LAYER_BADGE } from '../../lib/knowledgeLayers'
import { DRILL_DIMENSIONS, humanLabel, type DrillPayload } from '../../lib/drill'
import { RichText } from '../shared'
import { UsDotMap } from '../UsDotMap'
import { NaDotMap } from '../NaDotMap/NaDotMap'

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

interface ConvRow { bot_id: number; conversation_id: number; topic: string | null; sentiment: string | null; day: string; started_local: string | null; duration_sec: number | null; page_path: string | null; city: string | null; region: string | null; country_iso: string | null; lat: number | null; lon: number | null; recording_sid?: string | null }
interface MsgSource { layer: string; url?: string; label?: string }
interface Msg { sender: string; text: string; source?: MsgSource }

// Per-message knowledge-layer badge style, from the shared taxonomy (bg/text
// pill classes + the dot color) so it can't drift from the Knowledge card.
const layerStyle = (layer: string) => ({
  ...(LAYER_BADGE[layer] ?? LAYER_BADGE.Instructions),
  dot: LAYER_COLOR[layer] ?? LAYER_COLOR.Instructions,
})

// A Text Edit has no admin deep-link (cross-origin, and the admin exposes no
// per-edit URL — no route, no search param). Its list DOES have a client-side
// Search box that filters by title, so we open the list AND copy the edit's
// title; clicking flips the label to a "paste into Search" cue that persists
// (~6s) so it's still visible when the user glances back from the new admin tab.
function CopyOpenLink({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Open Text Edits in the admin & copy "${title}" — paste it into the Search box to jump to this edit`}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(title).catch(() => {})
        setCopied(true)
        window.setTimeout(() => setCopied(false), 6000)
      }}
      className="min-w-0 truncate underline decoration-dotted underline-offset-2 hover:opacity-80"
    >
      {copied ? '✓ copied — paste into Search' : title}
    </a>
  )
}

// page_path is host+path (query string already stripped). Drop a leading "www."
// for readability; the full value stays in the title / link href.
const prettyPage = (p: string) => p.replace(/^www\./, '')

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
  source = 'chat',
  onClose,
}: {
  botId: number
  /** Legacy single-dimension entry point (still supported). */
  filter?: LegacyFilter
  /** Universal multi-dimension drill payload (preferred — from chart clicks). */
  payload?: DrillPayload
  /** Scope to the same window as the dashboard/AI. Omit for all-time. */
  range?: { from: string; to: string }
  /** 'voice' lists from report.call_base (phone-geo + call dims: from_city→city,
   *  dur_sec→duration_sec, hour_local, handover); 'chat' (default) uses
   *  conversation_time. Same modal + the bot-scoped /api/transcript either way. */
  source?: 'chat' | 'voice'
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
  // Each conversation row keyed by id so expanding one can scroll its top into view.
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map())
  const [transcript, setTranscript] = useState<Msg[] | null>(null)
  const [loadingT, setLoadingT] = useState(false)

  const from = p.from ?? range?.from
  const to = p.to ?? range?.to

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      if (!sb) { setRows([]); setCount(0); return }
      const isVoice = source === 'voice'
      // chat: conversation_time (the local time-spine superset). voice: call_base —
      // one row per voice conversation, phone-geo + call dims aliased to the chat
      // shape (from_city→city, dur_sec→duration_sec). Same modal + /api/transcript.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = isVoice
        ? sb.schema('report').from('call_base')
            .select('bot_id, conversation_id, topic, sentiment, day, started_local, duration_sec:dur_sec, city:from_city, country_iso:from_country, lat:from_lat, lon:from_lon, recording_sid', { count: 'exact' })
            .eq('bot_id', p.botId)
        : sb.schema('report').from('conversation_time')
            .select('bot_id, conversation_id, topic, sentiment, day, started_local, duration_sec, page_path, city, region, country_iso, lat, lon', { count: 'exact' })
            .eq('bot_id', p.botId)
            .eq('substantive', true)
      // shared drill dims
      if (p.section) q = q.ilike('section', p.section)
      if (p.topic) q = q.ilike('topic', `%${p.topic}%`)
      if (p.day) q = q.eq('day', p.day)
      if (isVoice) {
        // voice: caller (user_id), city, call-hour + handover live on call_base
        if (p.user_id) q = q.eq('user_id', Number(p.user_id))
        if (p.city) q = q.eq('from_city', p.city)
        if (p.hour_local != null && p.hour_local !== '') q = q.eq('hour_local', Number(p.hour_local))
        if (p.handover) q = q.eq('handover', p.handover)
      } else {
        if (p.pinchpoint) q = q.ilike('pinchpoint', p.pinchpoint)
        if (p.funnel_stage) q = q.eq('funnel_stage', p.funnel_stage)
        if (p.city) q = q.eq('city', p.city)
      }
      if (from && to) q = q.gte('day', from).lte('day', to)
      // Sentiment: a locked sentiment (drill target) wins; otherwise the toggle.
      if (lockedSentiment) q = q.eq('sentiment', lockedSentiment)
      else if (sentFilter !== 'all') q = q.eq('sentiment', sentFilter)

      // voice orders by the resort-local call time; chat by its exact UTC ts.
      const ordered = isVoice
        ? q.order('started_local', { ascending: false })
        : q.order('started_at', { ascending: false })
      const { data, count: total } = await ordered.limit(LIST_CAP)
      if (!cancelled) {
        setRows((data as ConvRow[]) ?? [])
        setCount(total ?? (data?.length ?? 0))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.botId, p.section, p.pinchpoint, p.sentiment, p.funnel_stage, p.topic, p.city, p.day, p.handover, p.hour_local, p.user_id, source, from, to, sentFilter])

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

  // On expand, bring the opened conversation's top into view — so you land at the
  // start of the new conversation instead of wherever you were scrolled.
  useEffect(() => {
    if (openCid == null) return
    rowRefs.current.get(openCid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openCid])

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
                <li
                  key={r.conversation_id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(r.conversation_id, el)
                    else rowRefs.current.delete(r.conversation_id)
                  }}
                  className={`overflow-hidden rounded-lg border [content-visibility:auto] [contain-intrinsic-size:auto_3rem] ${
                    openCid === r.conversation_id ? 'border-botscrew-400 shadow-sm' : 'border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => openConv(r.conversation_id)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                      openCid === r.conversation_id ? 'bg-botscrew-50 hover:bg-botscrew-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition ${openCid === r.conversation_id ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-700">
                        {r.topic || `Conversation ${r.conversation_id}`}
                      </span>
                      {r.page_path && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400" title={r.page_path}>
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate">{prettyPage(r.page_path)}</span>
                        </span>
                      )}
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
                      {source === 'voice' && r.recording_sid ? (
                        <div className="mb-3">
                          <audio
                            controls
                            preload="none"
                            className="h-9 w-full"
                            src={`/api/recording?botId=${botId}&cid=${r.conversation_id}`}
                          >
                            Your browser can’t play this recording.
                          </audio>
                        </div>
                      ) : null}
                      {(fmtDur(r.duration_sec) || r.city) ? (
                        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-2 text-[11px]">
                          {fmtDur(r.duration_sec) ? (
                            <span className="font-medium text-slate-400">{fmtDur(r.duration_sec)} conversation</span>
                          ) : null}
                          {r.city ? (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                              <span className="font-medium text-slate-700">{[r.city, r.region].filter(Boolean).join(', ')}</span>
                              {r.country_iso ? <span className="text-slate-400">· {r.country_iso}</span> : null}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {r.lat != null && r.lon != null ? (
                        <div className="mb-2.5 overflow-hidden rounded-lg border border-slate-100 bg-white">
                          {source === 'voice' ? (
                            // North-America map (voice callers skew Canadian — Calgary/Edmonton lead)
                            <NaDotMap
                              points={[{ city: r.city ?? 'Location', lat: r.lat, lon: r.lon, conversations: 1 }]}
                              height={170}
                            />
                          ) : (
                            <UsDotMap
                              points={[{ city: r.city ?? 'Location', lat: r.lat, lon: r.lon, conversations: 1 }]}
                              single
                              height={150}
                            />
                          )}
                        </div>
                      ) : null}
                      {loadingT ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcript…
                        </div>
                      ) : transcript && transcript.length ? (
                        <div className="space-y-2">
                          {transcript.map((m, i) => {
                            const isUser = m.sender === 'user'
                            const Avatar = isUser ? User : Bot
                            return (
                              <div
                                key={i}
                                className={`flex gap-2 border-l-2 py-1.5 pl-2 pr-1 ${
                                  isUser ? 'rounded-r-md border-botscrew-400 bg-botscrew-50/60' : 'border-transparent'
                                }`}
                              >
                                <span
                                  aria-label={isUser ? 'Guest' : 'Bot'}
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                    isUser ? 'bg-botscrew-100 text-botscrew-600' : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  <Avatar className="h-3 w-3" strokeWidth={2} />
                                </span>
                                <div
                                  className={`min-w-0 flex-1 text-sm leading-relaxed ${
                                    isUser ? 'font-medium text-slate-900' : 'text-slate-500'
                                  }`}
                                >
                                  <RichText text={m.text} />
                                  {!isUser && m.source && (() => {
                                    const st = layerStyle(m.source.layer)
                                    // Text Edits has no admin deep-link (no per-edit route, no URL
                                    // search param). But the admin's list has a client-side Search box
                                    // that filters by title — so we open the page AND copy the edit's
                                    // title, and the user pastes into Search to land on this exact edit.
                                    const isTextEdit = m.source.layer === 'Text Edits'
                                    return (
                                      <span
                                        className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full ${st.bg} px-2 py-0.5 text-[11px] ${st.text}`}
                                        title={isTextEdit
                                          ? 'Open Text Edits in the admin — the title is copied to your clipboard; paste it into the Search box to jump to this edit'
                                          : (m.source.url || m.source.label || m.source.layer)}
                                      >
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: st.dot }} />
                                        <span className="font-medium">{m.source.layer}</span>
                                        {m.source.url ? (
                                          isTextEdit && m.source.label ? (
                                            <CopyOpenLink title={m.source.label} url={m.source.url} />
                                          ) : (
                                            <a
                                              href={m.source.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="min-w-0 truncate underline decoration-dotted underline-offset-2 hover:opacity-80"
                                            >
                                              {m.source.label}
                                            </a>
                                          )
                                        ) : m.source.label ? (
                                          <span className="min-w-0 truncate opacity-80">· {m.source.label}</span>
                                        ) : m.source.layer === 'Instructions' ? (
                                          <span className="opacity-70">· no source</span>
                                        ) : null}
                                      </span>
                                    )
                                  })()}
                                </div>
                              </div>
                            )
                          })}
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
