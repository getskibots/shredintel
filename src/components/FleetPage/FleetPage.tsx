import { useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Bot, DollarSign, Filter, Headphones, LayoutGrid, List, Search, TrendingUp, UserRound, Zap } from 'lucide-react'
import { useFleetOverview, type FleetBotRow } from '../../data/useFleetOverview'
import { useFleetFix } from '../../data/useFleetFix'
import { FleetSummary } from '../DailyFix/FleetSummary'
import { FleetDrill, type DrillTarget } from '../DailyFix'
import { verticalMeta } from '../../lib/verticalLabels'
import { Metric } from '../shared/Metric'
import { PeriodPicker } from '../PeriodPicker'
import {
  resolveSelection,
  selectionFromSearchParams,
  writeSelectionToSearchParams,
  type PeriodSelection,
} from '../../lib/period'

/**
 * /fleet — the master dashboard: every bot on one page (GSB-internal).
 * Fleet-wide usage hero + a per-bot traffic table, grouped by detected
 * vertical (default) or ranked flat across the fleet. Same PeriodPicker as
 * the per-bot dashboards; every number on the page follows the selected
 * window (report.fleet_usage rpc). Voice cost = real Twilio per-call price
 * (report.voice_cost_daily). Each row links to that bot's dashboard.
 */

type SortKey = 'conversations' | 'delta' | 'engaged' | 'messages' | 'voice_minutes' | 'voice_cost_usd' | 'voice_recording_usd' | 'ai_cost_usd' | 'total_cost_usd' | 'cost_per_conv' | 'cost_per_min' | 'conv_all' | 'last_active'

const fmt = (n: number) => n.toLocaleString('en-US')
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Active = any bot with "active" in its name (GSB live-production convention);
 *  everything else is a demo/test/template/clone bot. */
const isActiveBot = (name: string) => /active/i.test(name)

type BotFilter = 'all' | 'active' | 'demo'

function deltaPct(r: FleetBotRow): number | null {
  if (r.prev_conversations === 0) return r.conversations > 0 ? null : 0 // null = "new" (no baseline)
  return (r.conversations - r.prev_conversations) / r.prev_conversations
}

/** Per-bot all-in run cost ÷ conversations. */
const botCostPerConv = (r: FleetBotRow) => (r.conversations > 0 ? r.total_cost_usd / r.conversations : 0)
/** Per-bot all-in run cost ÷ voice minutes (voice bots only). */
const botCostPerMin = (r: FleetBotRow) => (r.voice_minutes > 0 ? r.total_cost_usd / r.voice_minutes : 0)

function sortValue(r: FleetBotRow, key: SortKey): number {
  if (key === 'delta') return deltaPct(r) ?? Number.POSITIVE_INFINITY
  if (key === 'last_active') return r.last_active ? new Date(r.last_active).getTime() : 0
  if (key === 'cost_per_conv') return botCostPerConv(r)
  if (key === 'cost_per_min') return botCostPerMin(r)
  return r[key]
}

/** Tiny inline sparkline — the range split into ≤12 equal buckets. */
function Spark({ points }: { points: number[] | null }) {
  if (!points || points.length < 2 || points.every((p) => p === 0)) {
    return <span className="text-xs text-slate-300">—</span>
  }
  const w = 96
  const h = 24
  const max = Math.max(...points)
  const step = w / (points.length - 1)
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-botscrew-400" />
    </svg>
  )
}

function DeltaBadge({ row }: { row: FleetBotRow }) {
  const d = deltaPct(row)
  if (d === null) return <span className="text-xs font-medium text-sky-600">new</span>
  if (row.conversations === 0 && row.prev_conversations === 0) return <span className="text-xs text-slate-300">—</span>
  const pct = Math.round(Math.abs(d) * 100)
  if (pct === 0) return <span className="text-xs text-slate-400">flat</span>
  return d > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
      <ArrowUp className="h-3 w-3" strokeWidth={2.5} />{pct}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-500">
      <ArrowDown className="h-3 w-3" strokeWidth={2.5} />{pct}%
    </span>
  )
}

function lastActiveLabel(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.max(0, Math.round((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 86_400_000))
  if (days <= 1) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${(days / 365).toFixed(1)}y ago`
}

export function FleetPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selection = selectionFromSearchParams(searchParams, { kind: 'preset', preset: 'all' })
  const range = resolveSelection(selection)
  const fleetFix = useFleetFix(range)
  const isDailyFix = selection.kind === 'preset' && selection.preset === '1d'
  const [drill, setDrill] = useState<DrillTarget | null>(null)
  const setSelection = (next: PeriodSelection) => {
    const params = writeSelectionToSearchParams(new URLSearchParams(searchParams), next)
    setSearchParams(params, { replace: true })
  }
  // Cost toggle — reveals the cost sections in place (no separate page). URL-addressable
  // (?view=cost) so it's shareable and survives reload; shares the date range + filters.
  const showCost = searchParams.get('view') === 'cost'
  const setShowCost = (on: boolean) => {
    const params = new URLSearchParams(searchParams)
    if (on) params.set('view', 'cost')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }

  const { rows, bill, isLive, isLoading } = useFleetOverview(range)
  const [query, setQuery] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [botFilter, setBotFilter] = useState<BotFilter>('all')
  const [channelFilter, setChannelFilter] = useState<'all' | 'chat' | 'voice'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('conversations')
  const [sortDesc, setSortDesc] = useState(true)
  const q = query.trim().toLowerCase()

  // Active vs Demo split (name-based), over every deployed bot.
  const activeCount = useMemo(() => rows.filter((r) => isActiveBot(r.name)).length, [rows])
  const demoCount = rows.length - activeCount

  // Apply the Active/Demo filter, then keep bots with recorded traffic; the rest
  // collapse into one count line.
  const classified = useMemo(() => {
    let out = rows
    if (botFilter !== 'all') out = out.filter((r) => (botFilter === 'active' ? isActiveBot(r.name) : !isActiveBot(r.name)))
    if (channelFilter !== 'all') out = out.filter((r) => r.channel === channelFilter)
    return out
  }, [rows, botFilter, channelFilter])
  const traffic = useMemo(() => classified.filter((r) => r.conv_all > 0), [classified])
  const silent = classified.length - traffic.length

  const filtered = useMemo(
    () => (!q ? traffic : traffic.filter((r) => r.name.toLowerCase().includes(q) || String(r.bot_id).includes(q))),
    [traffic, q],
  )

  const sorted = useMemo(() => {
    const s = filtered.slice().sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey))
    return sortDesc ? s : s.reverse()
  }, [filtered, sortKey, sortDesc])

  const groups = useMemo(() => {
    if (!grouped || q) return null
    const g = new Map<string, FleetBotRow[]>()
    for (const r of sorted) {
      const list = g.get(r.vertical)
      if (list) list.push(r)
      else g.set(r.vertical, [r])
    }
    return [...g.entries()]
      .map(([key, list]) => ({ key, meta: verticalMeta(key), rows: list }))
      .sort((a, b) => a.meta.order - b.meta.order || b.rows.length - a.rows.length)
  }, [sorted, grouped, q])

  // Fleet hero — summed client-side from the same rows the table shows.
  const hero = useMemo(() => {
    const conv = rows.reduce((s, r) => s + r.conversations, 0)
    const prev = rows.reduce((s, r) => s + r.prev_conversations, 0)
    const engaged = rows.reduce((s, r) => s + r.engaged, 0)
    const msgs = rows.reduce((s, r) => s + r.messages, 0)
    const active = rows.filter((r) => r.conversations > 0).length
    const voiceCost = rows.reduce((s, r) => s + r.voice_cost_usd, 0)
    const voiceCalls = rows.reduce((s, r) => s + r.voice_calls, 0)
    const voiceMinutes = rows.reduce((s, r) => s + r.voice_minutes, 0)
    const aiCost = rows.reduce((s, r) => s + r.ai_cost_usd, 0)
    const recCost = rows.reduce((s, r) => s + r.voice_recording_usd, 0)
    const totalCost = rows.reduce((s, r) => s + r.total_cost_usd, 0)
    // Inbound (guest→AI) vs outbound (bot→human handover) telephony split.
    const inboundUsd = rows.reduce((s, r) => s + r.voice_inbound_usd, 0)
    const inboundMin = rows.reduce((s, r) => s + r.voice_inbound_min, 0)
    const outboundUsd = rows.reduce((s, r) => s + r.voice_outbound_usd, 0)
    const outboundMin = rows.reduce((s, r) => s + r.voice_outbound_min, 0)
    const outboundCalls = rows.reduce((s, r) => s + r.voice_outbound_calls, 0)
    // Transferred calls: AI-only time (before handoff) vs human-bridge time — the
    // ACCURATE, non-overlapping split (parent call − child leg).
    const transferredCalls = rows.reduce((s, r) => s + r.voice_transferred_calls, 0)
    const transferAiMin = rows.reduce((s, r) => s + r.voice_transfer_ai_min, 0)
    const transferHumanMin = rows.reduce((s, r) => s + r.voice_transfer_human_min, 0)
    // Chat vs Voice split — the marquee insight (volume vs cost by channel).
    let chatConv = 0, voiceConv = 0, chatCost = 0, voiceCost2 = 0
    // Voice marginal cost/minute = telephony usage (excl fixed rental) + recording
    // + AI, over talk minutes. Fixed seat/rental excluded — they don't scale w/ time.
    let voiceVarCost = 0
    for (const r of rows) {
      if (r.channel === 'voice') {
        voiceConv += r.conversations
        voiceCost2 += r.total_cost_usd
        voiceVarCost += (r.voice_cost_usd - r.voice_rental_usd) + r.voice_recording_usd + r.ai_cost_usd
      } else { chatConv += r.conversations; chatCost += r.total_cost_usd }
    }
    return {
      conv, prev, engaged, msgs, active, voiceCost, voiceCalls, voiceMinutes, aiCost, recCost, totalCost,
      chatConv, voiceConv, chatCost, voiceChannelCost: voiceCost2, voiceVarCost,
      inboundUsd, inboundMin, outboundUsd, outboundMin, outboundCalls,
      transferredCalls, transferAiMin, transferHumanMin,
    }
  }, [rows])
  const heroDelta = hero.prev > 0 ? (hero.conv - hero.prev) / hero.prev : null
  const hasVoiceCost = hero.voiceCost > 0
  const hasRecCost = hero.recCost > 0
  const hasAiCost = hero.aiCost > 0
  const hasTotalCost = hero.totalCost > 0
  // Prefer the true Twilio bill (Usage Records) for the hero; fall back to the
  // summed per-call price when the bill layer isn't populated for this window.
  const billTotal = bill?.total_usd ?? hero.voiceCost
  const hasBill = billTotal > 0

  // Total run cost = true Twilio bill + OpenAI (so it equals the two tiles above
  // it). No Botscrew platform fee — that's a synthetic estimate we keep off here.
  const runCost = billTotal + hero.aiCost

  // ── Insights derived from the channel split ──────────────────────────────
  const costPerConv = hero.conv > 0 ? runCost / hero.conv : 0
  const chatCPC = hero.chatConv > 0 ? hero.chatCost / hero.chatConv : 0
  const voiceCPC = hero.voiceConv > 0 ? hero.voiceChannelCost / hero.voiceConv : 0
  const voiceConvShare = hero.conv > 0 ? hero.voiceConv / hero.conv : 0
  const voiceCostShare = hero.totalCost > 0 ? hero.voiceChannelCost / hero.totalCost : 0
  const cpcRatio = chatCPC > 0 ? voiceCPC / chatCPC : 0
  const voiceCPM = hero.voiceMinutes > 0 ? hero.voiceVarCost / hero.voiceMinutes : 0
  const hasChannelSplit = hero.voiceConv > 0 && hero.chatConv > 0
  // Voice telephony: inbound (guest→AI) vs outbound (bot→human handover).
  const telephonyUsd = hero.inboundUsd + hero.outboundUsd
  const outboundCostShare = telephonyUsd > 0 ? hero.outboundUsd / telephonyUsd : 0
  const transferRate = hero.voiceCalls > 0 ? hero.outboundCalls / hero.voiceCalls : 0
  const hasTelephonySplit = hero.outboundUsd > 0 && hero.inboundUsd > 0
  // On a TRANSFERRED call, how long the AI handles it before handing off vs how
  // long the human is then on. Accurate (non-overlapping): AI-only = parent − child.
  const avgAiDur = hero.transferredCalls > 0 ? hero.transferAiMin / hero.transferredCalls : 0
  const avgHumanDur = hero.transferredCalls > 0 ? hero.transferHumanMin / hero.transferredCalls : 0

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  // Active-bots card cycles the table filter: all → active → demo → all.
  const cycleBotFilter = () =>
    setBotFilter((f) => (f === 'all' ? 'active' : f === 'active' ? 'demo' : 'all'))

  const rowLink = (r: FleetBotRow) =>
    `${r.channel === 'voice' ? `/voice/${r.bot_id}` : `/bot/${r.bot_id}`}${location.search}`

  // Δ (period-over-period change) is only meaningful when a prior window exists —
  // hidden on "All time" where every bot reads as "new".
  const hasDelta = hero.prev > 0

  // Table columns follow the toggle: usage columns in overview, cost columns in
  // cost view. Convs / All time / Active / Trend anchor both.
  const columns: { key: SortKey; label: string; title?: string }[] = [
    { key: 'conversations', label: 'Convs', title: `Conversations opened — ${range.label}` },
    ...(!showCost && hasDelta ? [{ key: 'delta' as SortKey, label: 'Δ', title: 'Change in conversations vs the equal-length window before this one' }] : []),
    ...(!showCost ? [{ key: 'engaged' as SortKey, label: 'Engaged', title: 'Conversations with at least one real guest message' }] : []),
    ...(!showCost ? [{ key: 'messages' as SortKey, label: 'Msgs', title: 'All messages, both directions' }] : []),
    ...(showCost && hasVoiceCost ? [{ key: 'voice_minutes' as SortKey, label: 'Min', title: 'Voice call minutes this window' }] : []),
    ...(showCost && hasVoiceCost ? [{ key: 'voice_cost_usd' as SortKey, label: 'Twilio', title: 'Twilio telephony — call charges + monthly phone-line rental, this window' }] : []),
    ...(showCost && hasRecCost ? [{ key: 'voice_recording_usd' as SortKey, label: 'Recordings', title: 'Twilio call-recording + storage, allocated to this bot' }] : []),
    ...(showCost && hasAiCost ? [{ key: 'ai_cost_usd' as SortKey, label: 'AI Tokens', title: 'OpenAI token spend for this bot’s project (true per-bot cost)' }] : []),
    ...(showCost && hasTotalCost ? [{ key: 'total_cost_usd' as SortKey, label: 'Total', title: 'Run cost: Twilio + recordings + AI tokens (real billed spend)' }] : []),
    ...(showCost && hasTotalCost ? [{ key: 'cost_per_conv' as SortKey, label: '$/conv', title: 'Total run cost ÷ conversations' }] : []),
    ...(showCost && hasVoiceCost ? [{ key: 'cost_per_min' as SortKey, label: '$/min', title: 'Total run cost ÷ voice minutes' }] : []),
    { key: 'conv_all', label: 'All time' },
    { key: 'last_active', label: 'Active' },
  ]

  const table = (list: FleetBotRow[]) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5 font-medium">Bot</th>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2.5 text-right font-medium">
                <button
                  type="button"
                  onClick={() => onSort(c.key)}
                  title={c.title}
                  className={['inline-flex items-center gap-1 uppercase tracking-wider', c.key === sortKey ? 'text-botscrew-600' : 'hover:text-slate-700'].join(' ')}
                >
                  {c.label}
                  {c.key === sortKey && (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </button>
              </th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {list.map((r) => (
            <tr key={r.bot_id} className="group hover:bg-botscrew-50/40">
              <td className="max-w-[280px] px-4 py-2">
                <Link to={rowLink(r)} className="flex items-center gap-2.5">
                  <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-md', r.channel === 'voice' ? 'bg-amber-50 text-amber-600' : 'bg-botscrew-50 text-botscrew-600'].join(' ')}>
                    {r.channel === 'voice' ? <Headphones className="h-3.5 w-3.5" strokeWidth={1.75} /> : <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800 group-hover:text-botscrew-700">{r.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      Bot {r.bot_id}{!grouped || q ? ` · ${verticalMeta(r.vertical).emoji} ${verticalMeta(r.vertical).label}` : ''}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(r.conversations)}</td>
              {!showCost && hasDelta && <td className="px-3 py-2 text-right"><DeltaBadge row={r} /></td>}
              {!showCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {fmt(r.engaged)}
                  {r.conversations > 0 && <span className="ml-1 text-[11px] text-slate-400">{Math.round((100 * r.engaged) / r.conversations)}%</span>}
                </td>
              )}
              {!showCost && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(r.messages)}</td>}
              {showCost && hasVoiceCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {r.voice_minutes > 0 ? fmt(Math.round(r.voice_minutes)) : <span className="text-slate-300">—</span>}
                </td>
              )}
              {showCost && hasVoiceCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.voice_cost_usd > 0 ? (
                    <span title={`${fmt(r.voice_calls)} calls · ${fmt(Math.round(r.voice_minutes))} min · usage ${usd(r.voice_cost_usd - r.voice_rental_usd)} + rental ${usd(r.voice_rental_usd)}`}>{usd(r.voice_cost_usd)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              )}
              {showCost && hasRecCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.voice_recording_usd > 0 ? usd(r.voice_recording_usd) : <span className="text-slate-300">—</span>}
                </td>
              )}
              {showCost && hasAiCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.ai_cost_usd > 0 ? usd(r.ai_cost_usd) : <span className="text-slate-300">—</span>}
                </td>
              )}
              {showCost && hasTotalCost && (
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                  {r.total_cost_usd > 0 ? (
                    <span title={`Twilio ${usd(r.voice_cost_usd)} + recordings ${usd(r.voice_recording_usd)} + AI tokens ${usd(r.ai_cost_usd)}`}>{usd(r.total_cost_usd)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              )}
              {showCost && hasTotalCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.total_cost_usd > 0 && r.conversations > 0 ? `$${botCostPerConv(r).toFixed(3)}` : <span className="text-slate-300">—</span>}
                </td>
              )}
              {showCost && hasVoiceCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.voice_minutes > 0 && r.total_cost_usd > 0 ? `$${botCostPerMin(r).toFixed(3)}` : <span className="text-slate-300">—</span>}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.conv_all)}</td>
              <td className="px-3 py-2 text-right text-xs text-slate-400">{lastActiveLabel(r.last_active)}</td>
              <td className="px-4 py-2 text-right"><Spark points={r.spark} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      {/* Header: title (left) + Daily Fix button + period picker (right) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fleet overview</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isLoading
              ? 'Loading fleet…'
              : `${rows.length} bots · ${hero.active} with traffic · ${range.label}`}
            {isLive ? ' · live' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCost(!showCost)}
            title="Toggle the cost view — Twilio, OpenAI, and per-bot spend for this window"
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
              showCost
                ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                : 'border-amber-200 bg-white text-amber-700 hover:border-amber-400',
            ].join(' ')}
          >
            <DollarSign className="h-4 w-4" strokeWidth={2} />
            Cost
          </button>
          <button
            type="button"
            onClick={() => setSelection({ kind: 'preset', preset: '1d' })}
            title="Jump to the latest complete day — today's fleet heartbeat"
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
              isDailyFix
                ? 'border-botscrew-500 bg-botscrew-500 text-white shadow-sm'
                : 'border-botscrew-200 bg-white text-botscrew-700 hover:border-botscrew-400',
            ].join(' ')}
          >
            <Zap className="h-4 w-4" strokeWidth={2} fill={isDailyFix ? 'currentColor' : 'none'} />
            Daily Fix
          </button>
          <PeriodPicker value={selection} onChange={setSelection} align="end" />
        </div>
      </div>

      {/* The heartbeat — mood / signal / top asks / flavor for the selected range.
          Hidden in cost view, which focuses on spend. */}
      {!showCost && <FleetSummary summary={fleetFix.summary} isLoading={fleetFix.isLoading} onDrill={setDrill} />}

      {/* Fleet-wide numbers — Usage row, then Cost row (each fills its grid) */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Conversations"
          value={fmt(hero.conv)}
          subValue={heroDelta === null ? range.label : `${heroDelta >= 0 ? '+' : ''}${Math.round(heroDelta * 100)}% vs prior window`}
          tone={heroDelta !== null && heroDelta < 0 ? 'default' : 'accent'}
          title={`Conversations opened across every bot — ${range.label}`}
        />
        <Metric
          label="Engaged"
          value={fmt(hero.engaged)}
          subValue={hero.conv > 0 ? `${Math.round((100 * hero.engaged) / hero.conv)}% engagement` : undefined}
          title="Conversations with at least one real guest message"
        />
        <Metric label="Messages" value={fmt(hero.msgs)} subValue="both directions" />
        {/* Active vs Demo — click to filter the table (all → active → demo → all) */}
        <button
          type="button"
          onClick={cycleBotFilter}
          title="Active = any bot with “active” in its name; the rest are demos. Click to filter the table."
          className={[
            'rounded-2xl border p-4 text-left transition',
            botFilter === 'all'
              ? 'border-slate-200 hover:border-botscrew-300'
              : 'border-botscrew-300 bg-botscrew-50/50 ring-1 ring-botscrew-200',
          ].join(' ')}
        >
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {botFilter === 'demo' ? 'Demo bots' : 'Active bots'}
            <Filter className={['h-3.5 w-3.5', botFilter === 'all' ? 'text-slate-300' : 'text-botscrew-500'].join(' ')} strokeWidth={2} />
          </div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {fmt(botFilter === 'demo' ? demoCount : activeCount)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {botFilter === 'all' && `${fmt(activeCount)} active · ${fmt(demoCount)} demo · tap to filter`}
            {botFilter === 'active' && <span className="font-medium text-botscrew-700">showing active · tap for demo</span>}
            {botFilter === 'demo' && <span className="font-medium text-botscrew-700">showing demo · tap to clear</span>}
          </div>
        </button>
      </div>
      {showCost && (hasBill || hasAiCost || hasTotalCost) && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {hasBill && (
            <Metric
              label="Twilio cost"
              value={usd(billTotal)}
              subValue={
                bill
                  ? `${fmt(hero.voiceCalls)} calls · ${fmt(Math.round(hero.voiceMinutes))} min`
                  : `${fmt(hero.voiceCalls)} calls · per-call only`
              }
              title={
                bill
                  ? `True Twilio bill for this window — calls ${usd(bill.calls_usd)} + numbers ${usd(bill.numbers_usd)} + recordings ${usd(bill.recordings_usd)} + media streams ${usd(bill.media_streams_usd)} + fees. Source: Twilio Usage Records.`
                  : 'Summed per-call price across voice bots (number rental + recording storage not included). The full bill layer isn’t populated for this window yet.'
              }
            />
          )}
          {hasAiCost && (
            <Metric
              label="OpenAI cost"
              value={usd(hero.aiCost)}
              subValue="LLM spend, all bots"
              title="True per-bot OpenAI spend for this window, from OpenAI's Costs API (each bot = its own OpenAI project). Excludes GSB-internal projects like enrichment."
            />
          )}
          {hasTotalCost && (
            <Metric
              label="Total cost"
              value={usd(runCost)}
              tone="accent"
              subValue="Twilio + OpenAI"
              title={`All-in run cost for this window: Twilio ${usd(billTotal)} + OpenAI ${usd(hero.aiCost)}. Real, billed spend — no synthetic platform fee.`}
            />
          )}
          {hasTotalCost && hero.conv > 0 && (
            <Metric
              label="Cost / conversation"
              value={`$${costPerConv.toFixed(3)}`}
              subValue={hasChannelSplit ? `chat $${chatCPC.toFixed(3)} · voice $${voiceCPC.toFixed(2)}` : 'all-in per conversation'}
              title="Run cost (Twilio + OpenAI) divided by conversations — real billed spend per conversation."
            />
          )}
        </div>
      )}

      {/* ── Insight: Chat vs Voice — volume vs cost by channel ─────────── */}
      {showCost && hasChannelSplit && hasTotalCost && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Chat vs Voice</h2>
            <span className="text-xs text-slate-400">volume &amp; cost this window</span>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            Voice is{' '}
            <span className="font-semibold text-slate-800">{(voiceConvShare * 100).toFixed(1)}%</span>{' '}
            of conversations but{' '}
            <span className="font-semibold text-amber-600">{(voiceCostShare * 100).toFixed(0)}%</span>{' '}
            of cost — about{' '}
            <span className="font-semibold text-slate-800">{cpcRatio >= 10 ? Math.round(cpcRatio) : cpcRatio.toFixed(1)}×</span>{' '}
            more expensive per conversation than chat.
          </p>

          {/* On a transferred call: AI-only time before handoff, then human time.
              Accurate non-overlapping split — the human usually runs longer. */}
          {avgAiDur > 0 && avgHumanDur > 0 && (
            <div
              className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5"
              title="For calls that transfer to a human: average time the AI handles the call before handoff, then average time the person is on. Non-overlapping (parent call minus the bridged leg)."
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">On a transferred call</span>
              <span className="inline-flex items-baseline gap-1.5">
                <Bot className="h-4 w-4 translate-y-0.5 text-botscrew-500" strokeWidth={1.75} />
                <span className="text-sm text-slate-500">AI first</span>
                <span className="font-display text-base font-semibold tabular-nums text-slate-900">{avgAiDur.toFixed(1)} min</span>
              </span>
              <span className="text-slate-300">→</span>
              <span className="inline-flex items-baseline gap-1.5">
                <UserRound className="h-4 w-4 translate-y-0.5 text-amber-500" strokeWidth={1.75} />
                <span className="text-sm text-slate-500">then human</span>
                <span className="font-display text-base font-semibold tabular-nums text-slate-900">{avgHumanDur.toFixed(1)} min</span>
              </span>
            </div>
          )}

          {/* proportion bars (compact): the gap between them IS the insight */}
          <div className="space-y-2">
            {[
              { label: 'Conversations', chat: hero.chatConv, voice: hero.voiceConv, fmt: (n: number) => fmt(n) },
              { label: 'Cost', chat: hero.chatCost, voice: hero.voiceChannelCost, fmt: (n: number) => usd(n) },
            ].map((row) => {
              const total = row.chat + row.voice
              const vPct = total > 0 ? (row.voice / total) * 100 : 0
              return (
                <div key={row.label}>
                  <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-medium uppercase tracking-wider">{row.label}</span>
                    <span className="tabular-nums">
                      <span className="text-botscrew-600">chat {row.fmt(row.chat)}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span className="text-amber-600">voice {row.fmt(row.voice)}</span>
                    </span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-botscrew-500" style={{ width: `${100 - vPct}%` }} />
                    <div className="bg-amber-400" style={{ width: `${vPct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <button
              type="button"
              onClick={() => setChannelFilter((f) => (f === 'chat' ? 'all' : 'chat'))}
              title="Filter the table to chat bots"
              className={[
                'rounded-xl border bg-botscrew-50/50 p-3 text-left transition',
                channelFilter === 'chat' ? 'border-botscrew-400 ring-2 ring-botscrew-200' : 'border-botscrew-100 hover:border-botscrew-300',
              ].join(' ')}
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-botscrew-700">Chat · cost / conversation</div>
              <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-slate-900">${chatCPC.toFixed(3)}</div>
              <div className="text-xs text-slate-500">{fmt(hero.chatConv)} conversations · {usd(hero.chatCost)}</div>
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter((f) => (f === 'voice' ? 'all' : 'voice'))}
              title="Filter the table to voice bots"
              className={[
                'rounded-xl border bg-amber-50/50 p-3 text-left transition',
                channelFilter === 'voice' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-100 hover:border-amber-300',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-amber-700">Voice · cost / conversation</div>
                {voiceCPM > 0 && (
                  <span
                    className="text-[11px] font-medium tabular-nums text-amber-700"
                    title="Marginal cost per talk minute — Twilio call charge + recording + OpenAI realtime audio, over voice minutes. Excludes fixed line rental (doesn't scale with time)."
                  >
                    ${voiceCPM.toFixed(3)} / min
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-slate-900">${voiceCPC.toFixed(2)}</div>
              <div className="text-xs text-slate-500">
                {fmt(hero.voiceConv)} conversations · {usd(hero.voiceChannelCost)}
                {hero.voiceMinutes > 0 && <> · {fmt(Math.round(hero.voiceMinutes))} min</>}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Insight: Voice telephony — inbound (AI) vs outbound (human handover) ── */}
      {showCost && hasTelephonySplit && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Voice: AI-handled vs human handover</h2>
            <span className="text-xs text-slate-400">Twilio call charges this window</span>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{(transferRate * 100).toFixed(0)}%</span> of voice calls
            transfer to a live person — those handover legs are{' '}
            <span className="font-semibold text-rose-600">{(outboundCostShare * 100).toFixed(0)}%</span> of telephony spend
            ({usd(hero.outboundUsd)} of {usd(telephonyUsd)}).
          </p>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium uppercase tracking-wider">Call charges</span>
            <span className="tabular-nums">
              <span className="text-emerald-600">inbound (AI) {usd(hero.inboundUsd)}</span>
              <span className="mx-1.5 text-slate-300">|</span>
              <span className="text-rose-600">handover {usd(hero.outboundUsd)}</span>
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-400" style={{ width: `${100 - outboundCostShare * 100}%` }} />
            <div className="bg-rose-400" style={{ width: `${outboundCostShare * 100}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">Inbound · AI-handled</div>
              <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-slate-900">{usd(hero.inboundUsd)}</div>
              <div className="text-xs text-slate-500">{fmt(Math.round(hero.inboundMin))} min</div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-rose-700">Outbound · human handover</div>
              <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-slate-900">{usd(hero.outboundUsd)}</div>
              <div className="text-xs text-slate-500">{fmt(hero.outboundCalls)} transfers · {fmt(Math.round(hero.outboundMin))} min</div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: search + grouping toggle, right above the table */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or id…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
          />
        </div>
        {/* Channel filter — All / Chat / Voice */}
        <div className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(['all', 'chat', 'voice'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className={[
                'rounded-md px-2.5 py-1.5 capitalize transition',
                channelFilter === ch ? 'bg-botscrew-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800',
              ].join(' ')}
            >
              {ch}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setGrouped((g) => !g)}
          title={grouped ? 'Switch to one flat fleet ranking' : 'Group by vertical'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-botscrew-300 hover:text-botscrew-700"
        >
          {grouped ? <List className="h-4 w-4" strokeWidth={1.75} /> : <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />}
          {grouped ? 'Flat' : 'Grouped'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-400">Loading fleet…</div>
      ) : !isLive ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">
          Fleet data unavailable — check the Supabase connection.
        </div>
      ) : groups === null ? (
        sorted.length === 0 ? (
          <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">No bots match “{query}”.</div>
        ) : (
          table(sorted)
        )
      ) : (
        <div className="space-y-8">
          {groups.map((grp) => (
            <section key={grp.key}>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-base" aria-hidden>{grp.meta.emoji}</span>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">{grp.meta.label}</h2>
                <span className="text-xs text-slate-400">
                  {grp.rows.length} · {fmt(grp.rows.reduce((s, r) => s + r.conversations, 0))} conversations
                </span>
              </div>
              {table(grp.rows)}
            </section>
          ))}
        </div>
      )}

      {!isLoading && silent > 0 && !q && (
        <p className="mt-6 text-center text-xs text-slate-400">
          + {silent} {botFilter === 'active' ? 'active ' : botFilter === 'demo' ? 'demo ' : 'deployed '}
          bot{silent === 1 ? '' : 's'} with no recorded traffic
        </p>
      )}

      {drill && <FleetDrill target={drill} range={range} onClose={() => setDrill(null)} />}
    </div>
  )
}
