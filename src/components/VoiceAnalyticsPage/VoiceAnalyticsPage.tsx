/**
 * VoiceAnalyticsPage — the voice-native dashboard card (route /voice/:botId,
 * and the /bot/:botId dispatcher renders it for voice bots).
 *
 * Voice-native panels (call volume + ABANDON rate, typical duration, peak-hours
 * staffing, phone-based caller geo) alongside the reused enrichment (topics,
 * handover, sentiment). EVERYTHING drills: click any mark → the exact calls
 * (ConversationExplorer source="voice", backed by report.call_base) → transcript.
 * Data from report.call_* via useVoiceCallAnalytics; honest empties when no voice.
 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { PeriodPicker } from '../PeriodPicker/PeriodPicker'
import { resolveSelection, type PeriodSelection } from '../../lib/period'
import { useVoiceCallAnalytics, type VoiceBreakdown } from '../../data/useVoiceCallAnalytics'
import { useAvailableBots } from '../../data/useAnalytics'
import { ConversationExplorer } from '../ConversationExplorer/ConversationExplorer'
import { TwilioConnect } from '../TwilioConnect/TwilioConnect'
import { NaDotMap } from '../NaDotMap/NaDotMap'
import { AskBar } from '../AskBar'
import { RealtimeAgent } from '../RealtimeAgent'
import { useShredPulse } from '../ShreddingOverlay'
import { type DrillPayload } from '../../lib/drill'
import { Panel, Metric, EmptyState } from '../shared'
import { formatNumber, formatPercent, formatPercentSmart } from '../../lib/formatters'
import { brand, chart, sentimentColors } from '../../lib/chartTheme'

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function fmtHour(h: number): string {
  const ap = h < 12 ? 'a' : 'p'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}${ap}`
}

function fmtTalk(sec: number): string {
  if (!sec) return '—'
  const h = sec / 3600
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)} h`
  return `${Math.round(sec / 60)} min`
}

/** Ranked-bar list (leaderboard). `onSelect(label)` makes each row drillable. */
function RankedBars({
  items, colorFor, onSelect,
}: {
  items: { label: string; value: number }[]
  colorFor?: (label: string, i: number) => string
  onSelect?: (label: string) => void
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (items.length === 0) return <EmptyState title="No data" message="Nothing in this range yet." />
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const inner = (
          <>
            <div className="w-28 shrink-0 truncate text-xs font-medium text-slate-600" title={it.label}>{it.label}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded" style={{ width: `${(it.value / max) * 100}%`, background: colorFor ? colorFor(it.label, i) : brand.blue }} />
            </div>
            <div className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{formatNumber(it.value)}</div>
          </>
        )
        return onSelect ? (
          <button key={it.label} type="button" onClick={() => onSelect(it.label)}
            className="flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-slate-50">
            {inner}
          </button>
        ) : (
          <div key={it.label} className="flex items-center gap-3">{inner}</div>
        )
      })}
    </div>
  )
}

const sentimentColorFor = (label: string): string => {
  const k = label.toLowerCase()
  if (k.includes('pos')) return sentimentColors.positive
  if (k.includes('neg')) return sentimentColors.negative
  return sentimentColors.neutral
}

function toBars(rows: VoiceBreakdown[], limit = 8): { label: string; value: number }[] {
  return rows.slice(0, limit).map((r) => ({ label: r.key, value: r.conversations }))
}

const DEFAULT_PERIOD: PeriodSelection = { kind: 'preset', preset: '30d' }

export function VoiceAnalyticsPage() {
  const { botId: botIdParam } = useParams<{ botId: string }>()
  const botId = Number(botIdParam)
  const [selection, setSelection] = useState<PeriodSelection>(DEFAULT_PERIOD)
  const { data, isLoading, isLive } = useVoiceCallAnalytics(botId, selection)
  const { bots } = useAvailableBots()
  const [drill, setDrill] = useState<DrillPayload | null>(null)

  const range = useMemo(() => resolveSelection(selection), [selection])
  const openDrill = (dims: Partial<DrillPayload>) => setDrill({ botId, from: range.from, to: range.to, ...dims })
  // Conversational-intelligence layer (ask + voice), scoped to this bot + window.
  const askRange = { from: range.from, to: range.to, label: range.label }
  const [voiceActive, setVoiceActive] = useState(false)
  const shredding = useShredPulse(`${range.from}|${range.to}`)

  const botLabel = useMemo(
    () => bots.find((b) => b.botId === botId)?.label ?? `Bot ${botId}`,
    [bots, botId],
  )

  const m = data
  const peakHour = useMemo(() => {
    if (!m || m.hours.length === 0) return null
    return m.hours.reduce((a, b) => (b.calls > a.calls ? b : a))
  }, [m])

  const cityBars = useMemo(
    () => (m ? m.geo.slice(0, 8).map((g) => ({ label: g.city || g.country || 'Unknown', value: g.calls })) : []),
    [m],
  )
  const mapPoints = useMemo(
    () => (m
      ? m.geo
          .filter((g) => g.lat != null && g.lon != null && g.city)
          .map((g) => ({ city: g.city as string, lat: g.lat as number, lon: g.lon as number, conversations: g.calls }))
      : []),
    [m],
  )

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 sm:px-6">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-slate-200 bg-botscrew-50/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Voice Analytics</h1>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">{botLabel}</span>
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
              ].join(' ')}
            >
              <span className={['h-1.5 w-1.5 rounded-full', isLive ? 'bg-emerald-500' : 'bg-slate-400'].join(' ')} />
              {isLive ? 'LIVE' : 'Demo'}
            </span>
            <TwilioConnect botId={botId} />
          </div>
          <PeriodPicker value={selection} onChange={setSelection} />
        </div>
      </div>

      {/* Conversational intelligence layer — ask/search + voice AI (same as chat), scoped to this voice bot */}
      <div className="mb-6">
        <AskBar botId={botId} range={askRange} onVoice={() => setVoiceActive(true)} />
        <RealtimeAgent
          botId={botId}
          range={askRange}
          selection={selection}
          onSelectionChange={setSelection}
          shredding={shredding}
          active={voiceActive}
          onEnd={() => setVoiceActive(false)}
        />
      </div>

      {isLoading && !m ? (
        <div className="py-24 text-center text-sm text-slate-400">Loading voice analytics…</div>
      ) : !m || m.voiceConvs === 0 ? (
        <Panel eyebrow="Voice" title="Call activity">
          <EmptyState title="No voice calls in this range" message="This bot has no VOICE_TWILIO conversations for the selected period." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
          {/* KPIs + volume trend */}
          <Panel
            className="lg:col-span-12"
            eyebrow="Overview"
            title="Call volume & connection"
            description="How many calls came in, how many connected, and how many callers hung up before connecting."
            action={
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2 text-right"
                title="Share of callers who hung up before the AI answered — their choice, not a dropped call"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Hung up early</div>
                <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-slate-700">{formatPercent(m.abandonPct)}</div>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Metric label="Voice calls" value={formatNumber(m.voiceConvs)} subValue="total sessions" tone="accent" />
              <Metric label="Connected" value={formatNumber(m.connectedCalls)} subValue={`${formatPercent((m.connectedCalls / m.voiceConvs) * 100)} of calls`} />
              <Metric label="Didn't connect" value={formatNumber(m.unconnected)} subValue={`${formatPercent(m.abandonPct)} hung up`} />
              <Metric label="Engaged" value={formatNumber(m.engagedCalls)} subValue="got past hello" tone="good" />
              <Metric label="Handover-flagged" value={formatNumber(m.handoverCalls)} subValue={`${formatPercent((m.handoverCalls / m.voiceConvs) * 100)} of calls`} tone="risk" />
              <Metric label="Typical length" value={fmtDuration(m.medianDurSec)} subValue={m.durationSource === 'twilio' ? 'median · Twilio' : 'median (est.)'} />
              <Metric label="Avg length" value={fmtDuration(m.avgDurSec)} subValue={m.durationSource === 'twilio' ? 'mean · Twilio' : 'mean (est.)'} />
              <Metric label="Total talk time" value={fmtTalk(m.talkSec)} subValue={m.durationSource === 'twilio' ? 'Twilio truth' : 'estimated'} />
            </div>

            {/* AI-handled vs human talk time — Twilio truth (parent call duration −
                human transfer leg). The headline Voice-AI metric; shown only when the
                bot has Twilio call_facts (else duration is the unreliable mirror). */}
            {m.durationSource === 'twilio' && m.aiTalkSec != null && m.humanTalkSec != null && m.aiTalkSec + m.humanTalkSec > 0 && (() => {
              const total = m.aiTalkSec + m.humanTalkSec
              const aiPct = Math.round((100 * m.aiTalkSec) / total)
              const humanPct = 100 - aiPct
              return (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">AI-handled vs human talk time</span>
                    <span className="text-[11px] text-slate-400">Twilio truth · {fmtTalk(m.talkSec)} total</span>
                  </div>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div style={{ width: `${aiPct}%`, background: brand.blue }} title={`AI ${fmtTalk(m.aiTalkSec)}`} />
                    <div style={{ width: `${humanPct}%`, background: brand.gold }} title={`Human ${fmtTalk(m.humanTalkSec)}`} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-botscrew-700">AI handled {fmtTalk(m.aiTalkSec)} · {aiPct}%</span>
                    <span className="font-medium text-amber-700">{humanPct}% · {fmtTalk(m.humanTalkSec)} with a human</span>
                  </div>
                </div>
              )
            })()}

            {m.volumeTrend.length > 1 && (
              <div className="mt-5">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart
                    data={m.volumeTrend}
                    onClick={(e: { activeLabel?: string | number } | null) => {
                      const d = e?.activeLabel
                      if (d != null) openDrill({ day: String(d) })
                    }}
                  >
                    <defs>
                      <linearGradient id="voiceVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={brand.blue} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={brand.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...chart.grid} />
                    <XAxis dataKey="date" {...chart.xAxis} minTickGap={24} />
                    <YAxis {...chart.yAxis} />
                    <Tooltip {...chart.tooltip} />
                    <Area type="monotone" dataKey="voiceConvs" name="Calls" stroke={brand.blue} strokeWidth={2} fill="url(#voiceVol)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="connectedCalls" name="Connected" stroke={brand.gold} strokeWidth={2} fill="none" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Peak hours (staffing) */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Staffing"
            title="When the phone rings"
            description="Calls by hour of the resort's local day — click an hour to see those calls."
            action={
              peakHour ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Peak hour</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">{fmtHour(peakHour.hour)}</div>
                </div>
              ) : undefined
            }
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={m.hours}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="hour" tickFormatter={fmtHour} {...chart.xAxis} interval={1} />
                <YAxis {...chart.yAxis} />
                <Tooltip {...chart.tooltip} labelFormatter={(h) => `${fmtHour(Number(h))} local`} />
                <Bar
                  dataKey="calls"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(d) => { const h = (d as { payload?: { hour?: number } })?.payload?.hour; if (h != null) openDrill({ hour_local: String(h) }) }}
                >
                  {m.hours.map((h) => (
                    <Cell key={h.hour} fill={peakHour && h.hour === peakHour.hour ? brand.gold : brand.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Caller geography (phone-based) — map + ranked list, both drill by city */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Your callers"
            title="Where calls come from"
            description="Phone-based caller cities — click a dot or a city for its calls."
          >
            {mapPoints.length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/40 p-1">
                <NaDotMap points={mapPoints} height={240} onSelect={(city) => openDrill({ city })} />
              </div>
            )}
            <RankedBars items={cityBars} onSelect={(city) => openDrill({ city })} />
          </Panel>

          {/* Repeat callers — voice identity IS the phone number, so we can see who calls back */}
          {m.callers && m.callers.unique > 0 && (
            <Panel
              className="lg:col-span-12"
              eyebrow="Your callers"
              title="Repeat callers"
              description="Voice identity is the phone number — so we can see who calls back. Click a caller to hear all their calls across days."
              action={
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Repeat rate</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">{formatPercent(m.callers.repeatPct)}</div>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Unique callers" value={formatNumber(m.callers.unique)} subValue="distinct phone numbers" tone="accent" />
                <Metric label="Repeat callers" value={formatNumber(m.callers.repeat)} subValue={`${formatPercent(m.callers.repeatPct)} called again`} tone="good" />
                <Metric label="Avg calls / caller" value={m.callers.avgCalls.toFixed(1)} subValue="all-time" />
                <Metric label="Most by one caller" value={formatNumber(m.callers.maxCalls)} subValue="calls" tone="warn" />
              </div>

              <div className="mt-4">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">How often they call</div>
                <RankedBars
                  items={[
                    { label: 'One-time', value: m.callers.oneTime },
                    { label: '2–3 calls', value: m.callers.twoThree },
                    { label: '4+ calls', value: m.callers.fourPlus },
                  ]}
                />
              </div>

              {m.topCallers.length > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Most frequent callers — click to hear all their calls</div>
                  <div className="space-y-1.5">
                    {m.topCallers.map((c) => (
                      <button
                        key={c.userId}
                        type="button"
                        onClick={() => openDrill({ user_id: String(c.userId) })}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-50"
                      >
                        <span className="w-36 shrink-0 truncate text-xs font-medium text-slate-600">Caller #{c.userId}</span>
                        <span className="flex-1 text-xs text-slate-400">{c.activeDays} day{c.activeDays === 1 ? '' : 's'} active</span>
                        <span className="shrink-0 rounded-full bg-botscrew-50 px-2 py-0.5 text-xs font-semibold text-botscrew-700">{formatNumber(c.calls)} calls</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          )}

          {/* What callers ask (topics / knowledge sections) */}
          <Panel
            className="lg:col-span-12"
            eyebrow="Message intelligence"
            title="What callers ask about"
            description="The knowledge topics driving calls — click one to hear those conversations."
          >
            <RankedBars items={toBars(m.sectionMix, 12)} onSelect={(section) => openDrill({ section })} />
          </Panel>

          {/* Handover need */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Service"
            title="Human handover"
            description="Whether the call actually transferred to a person (ground truth from Twilio) vs the AI's read of the conversation."
            action={
              m.transfers ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Actually transferred</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-emerald-700">{formatPercent(m.transfers.transferRate)}</div>
                </div>
              ) : undefined
            }
          >
            {m.transfers ? (
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Metric label="Transferred" value={formatNumber(m.transfers.transferred)} subValue={`of ${formatNumber(m.transfers.checked)} calls`} tone="accent" />
                <Metric label="Human answered" value={formatPercentSmart(m.transfers.answeredRate)} subValue={`${formatNumber(m.transfers.answered)} connected`} tone="good" />
                <Metric label="Time with human" value={fmtDuration(m.transfers.avgHumanSec)} subValue="avg" />
              </div>
            ) : null}
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {m.transfers ? "AI's read of the conversation" : 'Handover need (AI-inferred)'}
            </div>
            <RankedBars
              items={toBars(m.handoverMix)}
              colorFor={(label) => (label.toLowerCase().includes('no handover') ? brand.blueSoft : brand.gold)}
              onSelect={(handover) => openDrill({ handover })}
            />
          </Panel>

          {/* Sentiment */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Service"
            title="Caller sentiment"
            description="Tone of the conversation — click to review those calls."
          >
            <RankedBars items={toBars(m.sentimentMix)} colorFor={sentimentColorFor} onSelect={(sentiment) => openDrill({ sentiment })} />
          </Panel>
        </div>
      )}

      {drill && (
        <ConversationExplorer
          botId={botId}
          source="voice"
          payload={drill}
          range={{ from: range.from, to: range.to }}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}
