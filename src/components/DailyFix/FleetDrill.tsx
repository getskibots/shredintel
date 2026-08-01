import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ChevronRight, Globe, Bot, User, MapPin } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { sentimentColors } from '../../lib/chartTheme'
import { LAYER_COLOR, LAYER_BADGE } from '../../lib/knowledgeLayers'
import { RichText } from '../shared'
import { UsDotMap } from '../UsDotMap'
import { NaDotMap } from '../NaDotMap/NaDotMap'
import type { ResolvedPeriod } from '../../lib/period'

/**
 * Fleet-wide drill-down: click any aggregate on Master'Botter (a mood segment,
 * a top-ask category, a flavor tag, a needs-attention tile) → the matching
 * conversations ACROSS ALL RESORTS, each labeled with its resort, newest first.
 * Full parity with the per-bot ConversationExplorer: each row shows its page +
 * local time; expanding shows the recording (voice), duration, caller geo + a
 * dot map, then the transcript with per-message knowledge-source badges. Reads
 * report.fleet_drill (which rides the same chat/voice sidecar views); each
 * transcript/recording opens via the bot-scoped /api/transcript · /api/recording.
 */

export interface DrillTarget {
  dim: 'sentiment' | 'urgency' | 'handover' | 'category' | 'flavor' | 'resolution' | 'outcome'
  value: string
  /** Human label for the header (e.g. "High urgency", "Pricing & Availability"). */
  label: string
}

interface DrillRow {
  bot_id: number
  bot_name: string
  conversation_id: number
  channel: 'voice' | 'chat'
  topic: string | null
  sentiment: string | null
  category: string | null
  day: string
  started_local: string | null
  duration_sec: number | null
  page_path: string | null
  city: string | null
  region: string | null
  country_iso: string | null
  lat: number | null
  lon: number | null
  recording_sid: string | null
}
interface MsgSource { layer: string; url?: string; label?: string }
interface Msg { sender: string; text: string; source?: MsgSource }

const sentColor = (s: string | null): string => {
  const k = (s || '').toLowerCase() as keyof typeof sentimentColors
  return sentimentColors[k] || '#94A3B8'
}
const layerStyle = (layer: string) => ({
  ...(LAYER_BADGE[layer] ?? LAYER_BADGE.Instructions),
  dot: LAYER_COLOR[layer] ?? LAYER_COLOR.Instructions,
})
const prettyPage = (p: string) => p.replace(/^www\./, '')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// started_local is a tz-less resort-local wall-clock — format from the string parts.
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

// Text Edits has no admin deep-link — open the list & copy the title to paste into Search.
function CopyOpenLink({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      title={`Open Text Edits in the admin & copy "${title}" — paste it into the Search box to jump to this edit`}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(title).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 6000) }}
      className="min-w-0 truncate underline decoration-dotted underline-offset-2 hover:opacity-80"
    >
      {copied ? '✓ copied — paste into Search' : title}
    </a>
  )
}

function SourceBadge({ source }: { source: MsgSource }) {
  const st = layerStyle(source.layer)
  const isTextEdit = source.layer === 'Text Edits'
  return (
    <span
      className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full ${st.bg} px-2 py-0.5 text-[11px] ${st.text}`}
      title={isTextEdit ? 'Open Text Edits in the admin — the title is copied to your clipboard; paste it into Search to jump to this edit' : (source.url || source.label || source.layer)}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: st.dot }} />
      <span className="font-medium">{source.layer}</span>
      {source.url ? (
        isTextEdit && source.label ? (
          <CopyOpenLink title={source.label} url={source.url} />
        ) : (
          <a href={source.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="min-w-0 truncate underline decoration-dotted underline-offset-2 hover:opacity-80">
            {source.label}
          </a>
        )
      ) : source.label ? (
        <span className="min-w-0 truncate opacity-80">· {source.label}</span>
      ) : source.layer === 'Instructions' ? (
        <span className="opacity-70">· no source</span>
      ) : null}
    </span>
  )
}

export function FleetDrill({ target, range, onClose }: { target: DrillTarget; range: ResolvedPeriod; onClose: () => void }) {
  const [rows, setRows] = useState<DrillRow[] | null>(null)
  const [openCid, setOpenCid] = useState<number | null>(null)
  const [transcript, setTranscript] = useState<Msg[] | null>(null)
  const [loadingT, setLoadingT] = useState(false)
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      if (!sb) { setRows([]); return }
      const { data, error } = (await sb.schema('report').rpc('fleet_drill', {
        p_dim: target.dim, p_value: target.value, p_from: range.from, p_to: range.to, p_limit: 100,
      })) as { data: DrillRow[] | null; error: unknown }
      if (!cancelled) setRows(error ? [] : (data ?? []))
    })()
    return () => { cancelled = true }
  }, [target.dim, target.value, range.from, range.to])

  async function openConv(r: DrillRow) {
    if (openCid === r.conversation_id) { setOpenCid(null); setTranscript(null); return }
    setOpenCid(r.conversation_id); setTranscript(null); setLoadingT(true)
    try {
      const res = await fetch(`/api/transcript?botId=${r.bot_id}&cid=${r.conversation_id}`)
      const data = await res.json()
      setTranscript(Array.isArray(data.messages) ? data.messages : [])
    } catch {
      setTranscript([])
    } finally {
      setLoadingT(false)
    }
  }

  useEffect(() => {
    if (openCid == null) return
    rowRefs.current.get(openCid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openCid])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Across all resorts · {range.label}</div>
            <div className="text-base font-semibold text-slate-900">
              {target.label}
              {rows != null ? <span className="ml-2 text-sm font-normal text-slate-400">{rows.length === 100 ? '100+' : rows.length} conversations</span> : null}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {rows === null ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No conversations for this in the selected range.</div>
          ) : (
            <>
              {rows.length === 100 && <p className="mb-2 px-1 text-xs text-slate-400">Showing the 100 most recent.</p>}
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li
                    key={`${r.bot_id}-${r.conversation_id}`}
                    ref={(el) => { if (el) rowRefs.current.set(r.conversation_id, el); else rowRefs.current.delete(r.conversation_id) }}
                    className={`overflow-hidden rounded-lg border ${openCid === r.conversation_id ? 'border-botscrew-400 shadow-sm' : 'border-slate-200'}`}
                  >
                    <button
                      onClick={() => openConv(r)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${openCid === r.conversation_id ? 'bg-botscrew-50 hover:bg-botscrew-100' : 'hover:bg-slate-50'}`}
                    >
                      <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition ${openCid === r.conversation_id ? 'rotate-90' : ''}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-botscrew-600">{r.bot_name}</span>
                          {r.channel === 'voice' && <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-slate-500">Voice</span>}
                        </span>
                        <span className="block truncate text-sm text-slate-700">{r.topic || `Conversation ${r.conversation_id}`}</span>
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
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${sentColor(r.sentiment)}1f`, color: sentColor(r.sentiment) }}>
                          {r.sentiment}
                        </span>
                      )}
                    </button>
                    {openCid === r.conversation_id && (
                      <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                        {r.channel === 'voice' && r.recording_sid ? (
                          <div className="mb-3">
                            <audio controls preload="none" className="h-9 w-full" src={`/api/recording?botId=${r.bot_id}&cid=${r.conversation_id}`}>
                              Your browser can’t play this recording.
                            </audio>
                          </div>
                        ) : null}
                        {(fmtDur(r.duration_sec) || r.city) ? (
                          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-2 text-[11px]">
                            {fmtDur(r.duration_sec) ? <span className="font-medium text-slate-400">{fmtDur(r.duration_sec)} conversation</span> : null}
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
                            {r.country_iso && r.country_iso !== 'US' ? (
                              <NaDotMap points={[{ city: r.city ?? 'Location', lat: r.lat, lon: r.lon, conversations: 1 }]} height={170} />
                            ) : (
                              <UsDotMap points={[{ city: r.city ?? 'Location', lat: r.lat, lon: r.lon, conversations: 1 }]} single height={150} />
                            )}
                          </div>
                        ) : null}
                        {loadingT ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcript…</div>
                        ) : transcript && transcript.length ? (
                          <div className="space-y-2">
                            {transcript.map((m, i) => {
                              const isUser = m.sender === 'user'
                              const Avatar = isUser ? User : Bot
                              return (
                                <div key={i} className={`flex gap-2 border-l-2 py-1.5 pl-2 pr-1 ${isUser ? 'rounded-r-md border-botscrew-400 bg-botscrew-50/60' : 'border-transparent'}`}>
                                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-botscrew-100 text-botscrew-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <Avatar className="h-3 w-3" strokeWidth={2} />
                                  </span>
                                  <div className={`min-w-0 flex-1 text-sm leading-relaxed ${isUser ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                                    <RichText text={m.text} />
                                    {!isUser && m.source && <SourceBadge source={m.source} />}
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
