/**
 * VoiceAnalyticsPage — the voice-native dashboard card (route /voice/:botId).
 *
 * Unlike the chat template, this renders the metrics only a phone channel has:
 * call volume + ABANDON rate (didn't-connect), typical call length, peak-hours
 * staffing, phone-based caller geography — plus the reused enrichment signals
 * (handover / sentiment) since a voice call IS a conversation. Data comes from
 * report.call_* via useVoiceCallAnalytics; honest empties when a bot has no voice.
 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { PeriodPicker } from '../PeriodPicker/PeriodPicker'
import { type PeriodSelection } from '../../lib/period'
import { useVoiceCallAnalytics, type VoiceBreakdown } from '../../data/useVoiceCallAnalytics'
import { useAvailableBots } from '../../data/useAnalytics'
import { Panel, Metric, EmptyState } from '../shared'
import { formatNumber, formatPercent } from '../../lib/formatters'
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

/** A simple ranked-bar list (leaderboard) — used for caller cities + breakdowns. */
function RankedBars({
  items, colorFor,
}: {
  items: { label: string; value: number }[]
  colorFor?: (label: string, i: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (items.length === 0) return <EmptyState title="No data" message="Nothing in this range yet." />
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.label} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-xs font-medium text-slate-600" title={it.label}>
            {it.label}
          </div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{ width: `${(it.value / max) * 100}%`, background: colorFor ? colorFor(it.label, i) : brand.blue }}
            />
          </div>
          <div className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
            {formatNumber(it.value)}
          </div>
        </div>
      ))}
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

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 sm:px-6">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-slate-200 bg-botscrew-50/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Voice Analytics</h1>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
              {botLabel}
            </span>
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
              ].join(' ')}
            >
              <span className={['h-1.5 w-1.5 rounded-full', isLive ? 'bg-emerald-500' : 'bg-slate-400'].join(' ')} />
              {isLive ? 'LIVE' : 'Demo'}
            </span>
          </div>
          <PeriodPicker value={selection} onChange={setSelection} />
        </div>
      </div>

      {isLoading && !m ? (
        <div className="py-24 text-center text-sm text-slate-400">Loading voice analytics…</div>
      ) : !m || m.voiceConvs === 0 ? (
        <Panel eyebrow="Voice" title="Call activity">
          <EmptyState
            title="No voice calls in this range"
            message="This bot has no VOICE_TWILIO conversations for the selected period."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
          {/* KPIs + volume trend */}
          <Panel
            className="lg:col-span-12"
            eyebrow="Overview"
            title="Call volume & connection"
            description="How many calls came in, how many connected, and how many dropped before connecting."
            action={
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Abandon rate</div>
                <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-amber-700">
                  {formatPercent(m.abandonPct)}
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Voice calls" value={formatNumber(m.voiceConvs)} subValue="total sessions" tone="accent" />
              <Metric
                label="Connected"
                value={formatNumber(m.connectedCalls)}
                subValue={`${formatPercent((m.connectedCalls / m.voiceConvs) * 100)} of calls`}
              />
              <Metric
                label="Didn't connect"
                value={formatNumber(m.unconnected)}
                subValue={`${formatPercent(m.abandonPct)} abandon`}
                tone="warn"
              />
              <Metric label="Engaged" value={formatNumber(m.engagedCalls)} subValue="got past hello" tone="good" />
              <Metric
                label="Handover-flagged"
                value={formatNumber(m.handoverCalls)}
                subValue={`${formatPercent((m.handoverCalls / m.voiceConvs) * 100)} of calls`}
                tone="risk"
              />
              <Metric label="Typical length" value={fmtDuration(m.medianDurSec)} subValue="median (connected)" />
            </div>

            {m.volumeTrend.length > 1 && (
              <div className="mt-5">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={m.volumeTrend}>
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
            className="lg:col-span-7"
            eyebrow="Staffing"
            title="When the phone rings"
            description="Calls by hour of the resort's local day — where to point coverage."
            action={
              peakHour ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Peak hour</div>
                  <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">
                    {fmtHour(peakHour.hour)}
                  </div>
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
                <Bar dataKey="calls" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {m.hours.map((h) => (
                    <Cell key={h.hour} fill={peakHour && h.hour === peakHour.hour ? brand.gold : brand.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* Caller geography (phone-based) */}
          <Panel
            className="lg:col-span-5"
            eyebrow="Your callers"
            title="Where calls come from"
            description="Phone-based caller cities — cleaner than IP (no VPNs)."
          >
            <RankedBars items={cityBars} />
          </Panel>

          {/* Handover need */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Service"
            title="Human handover"
            description="Callers who needed (or asked for) a person."
          >
            <RankedBars
              items={toBars(m.handoverMix)}
              colorFor={(label) => (label.toLowerCase().includes('no ') || label.toLowerCase() === 'no handover' ? brand.blueSoft : brand.gold)}
            />
          </Panel>

          {/* Sentiment */}
          <Panel
            className="lg:col-span-6"
            eyebrow="Service"
            title="Caller sentiment"
            description="Tone of the conversation, from the enrichment layer."
          >
            <RankedBars items={toBars(m.sentimentMix)} colorFor={sentimentColorFor} />
          </Panel>
        </div>
      )}
    </div>
  )
}
