import { useEffect, useState } from 'react'
import { X, Loader2, ChevronRight, ExternalLink } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import { sentimentColors } from '../../lib/chartTheme'

/**
 * Drill-down: click a sliver (section / pinchpoint / sentiment) → the matching
 * conversations → the actual transcript. Conversation list comes from
 * report.conversation_intel (anon-readable); the transcript comes from the
 * bot-scoped, PII-scrubbed /api/transcript. Every number becomes evidence.
 */

interface ConvRow { bot_id: number; conversation_id: number; topic: string | null; sentiment: string | null; day: string }

/** The Botscrew support deep-link for a conversation. Always built from the
 *  conversation's OWN bot_id (authoritative — verified 0 mismatches against
 *  admin_conversation→admin_user) so the URL can never point at the wrong bot. */
const botscrewSupportUrl = (botId: number, conversationId: number) =>
  `https://bots.getskitickets.com/admin/bot/${botId}/support/${conversationId}`
interface Msg { sender: string; text: string }

const sentColor = (s: string | null): string => {
  const k = (s || '').toLowerCase() as keyof typeof sentimentColors
  return sentimentColors[k] || '#94A3B8'
}

const LIST_CAP = 60

export function ConversationExplorer({
  botId,
  filter,
  range,
  onClose,
}: {
  botId: number
  filter: { dim: 'section' | 'pinchpoint' | 'sentiment'; value: string; label: string }
  /** Scope to the same window as the dashboard/AI. Omit for all-time. */
  range?: { from: string; to: string }
  onClose: () => void
}) {
  const [rows, setRows] = useState<ConvRow[] | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [sentFilter, setSentFilter] = useState<'all' | 'Positive' | 'Neutral' | 'Negative'>('all')
  const [openCid, setOpenCid] = useState<number | null>(null)
  const [transcript, setTranscript] = useState<Msg[] | null>(null)
  const [loadingT, setLoadingT] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      if (!sb) { setRows([]); setCount(0); return }
      // count:'exact' → true total for the header; .limit caps only the LIST.
      const base = sb
        .schema('report')
        .from('conversation_intel')
        .select('bot_id, conversation_id, topic, sentiment, day', { count: 'exact' })
        .eq('bot_id', botId)
        .ilike(filter.dim, filter.value)
        .eq('substantive', true)
      const scoped = range ? base.gte('day', range.from).lte('day', range.to) : base
      const withSent = sentFilter !== 'all' ? scoped.eq('sentiment', sentFilter) : scoped
      const { data, count: total } = await withSent.order('day', { ascending: false }).limit(LIST_CAP)
      if (!cancelled) {
        setRows((data as ConvRow[]) ?? [])
        setCount(total ?? (data?.length ?? 0))
      }
    })()
    return () => { cancelled = true }
  }, [botId, filter.dim, filter.value, range?.from, range?.to, sentFilter])

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

  const dimLabel = filter.dim === 'pinchpoint' ? 'Conversion blocker' : filter.dim === 'section' ? 'Knowledge section' : 'Sentiment'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{dimLabel}</div>
            <div className="text-base font-semibold text-slate-900">
              {filter.label}
              {count != null ? <span className="ml-2 text-sm font-normal text-slate-400">{count} conversations</span> : null}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {filter.dim !== 'sentiment' && (
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
                        <span className="text-[11px] font-medium text-slate-400">Conversation {r.conversation_id}</span>
                        <a
                          href={botscrewSupportUrl(r.bot_id, r.conversation_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-botscrew-600 transition hover:text-botscrew-700"
                        >
                          Open in Botscrew support <ExternalLink className="h-3 w-3" />
                        </a>
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
