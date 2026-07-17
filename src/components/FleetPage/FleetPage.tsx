import { useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Headphones, LayoutGrid, List, Search, TrendingUp } from 'lucide-react'
import { useFleetOverview, type FleetBotRow } from '../../data/useFleetOverview'
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

type SortKey = 'conversations' | 'delta' | 'engaged' | 'messages' | 'voice_cost_usd' | 'ai_cost_usd' | 'conv_all' | 'last_active'

const fmt = (n: number) => n.toLocaleString('en-US')
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function deltaPct(r: FleetBotRow): number | null {
  if (r.prev_conversations === 0) return r.conversations > 0 ? null : 0 // null = "new" (no baseline)
  return (r.conversations - r.prev_conversations) / r.prev_conversations
}

function sortValue(r: FleetBotRow, key: SortKey): number {
  if (key === 'delta') return deltaPct(r) ?? Number.POSITIVE_INFINITY
  if (key === 'last_active') return r.last_active ? new Date(r.last_active).getTime() : 0
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
  const selection = selectionFromSearchParams(searchParams, { kind: 'preset', preset: '30d' })
  const range = resolveSelection(selection)
  const setSelection = (next: PeriodSelection) => {
    const params = writeSelectionToSearchParams(new URLSearchParams(searchParams), next)
    setSearchParams(params, { replace: true })
  }

  const { rows, bill, isLive, isLoading } = useFleetOverview(range)
  const [query, setQuery] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('conversations')
  const [sortDesc, setSortDesc] = useState(true)
  const q = query.trim().toLowerCase()

  // Bots with any recorded traffic; the rest collapse into one count line.
  const traffic = useMemo(() => rows.filter((r) => r.conv_all > 0), [rows])
  const silent = rows.length - traffic.length

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
    return { conv, prev, engaged, msgs, active, voiceCost, voiceCalls, voiceMinutes, aiCost }
  }, [rows])
  const heroDelta = hero.prev > 0 ? (hero.conv - hero.prev) / hero.prev : null
  const hasVoiceCost = hero.voiceCost > 0
  const hasAiCost = hero.aiCost > 0
  // Prefer the true Twilio bill (Usage Records) for the hero; fall back to the
  // summed per-call price when the bill layer isn't populated for this window.
  const billTotal = bill?.total_usd ?? hero.voiceCost
  const hasBill = billTotal > 0

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  const rowLink = (r: FleetBotRow) =>
    `${r.channel === 'voice' ? `/voice/${r.bot_id}` : `/bot/${r.bot_id}`}${location.search}`

  const columns: { key: SortKey; label: string; title?: string }[] = [
    { key: 'conversations', label: 'Convs', title: `Conversations opened — ${range.label}` },
    { key: 'delta', label: 'Δ', title: 'vs the equal-length window before this one' },
    { key: 'engaged', label: 'Engaged', title: 'Conversations with at least one real guest message' },
    { key: 'messages', label: 'Msgs', title: 'All messages, both directions' },
    ...(hasVoiceCost ? [{ key: 'voice_cost_usd' as SortKey, label: 'Voice $', title: 'Twilio per-call price for this window (calls on this bot’s line)' }] : []),
    ...(hasAiCost ? [{ key: 'ai_cost_usd' as SortKey, label: 'AI $', title: 'OpenAI spend for this bot’s project (true per-bot cost)' }] : []),
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
              <td className="px-3 py-2 text-right"><DeltaBadge row={r} /></td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {fmt(r.engaged)}
                {r.conversations > 0 && <span className="ml-1 text-[11px] text-slate-400">{Math.round((100 * r.engaged) / r.conversations)}%</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(r.messages)}</td>
              {hasVoiceCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.voice_cost_usd > 0 ? (
                    <span title={`${fmt(r.voice_calls)} calls · ${fmt(Math.round(r.voice_minutes))} min`}>{usd(r.voice_cost_usd)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              )}
              {hasAiCost && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.ai_cost_usd > 0 ? usd(r.ai_cost_usd) : <span className="text-slate-300">—</span>}
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
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fleet overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isLoading
              ? 'Loading fleet…'
              : `${rows.length} bots · ${hero.active} active in this window`}
            {isLive ? ' · live' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or id…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-botscrew-400 focus:ring-2 focus:ring-botscrew-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setGrouped((g) => !g)}
            title={grouped ? 'Switch to one flat fleet ranking' : 'Group by vertical'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-botscrew-300 hover:text-botscrew-700"
          >
            {grouped ? <List className="h-4 w-4" strokeWidth={1.75} /> : <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />}
            {grouped ? 'Flat' : 'Grouped'}
          </button>
          <PeriodPicker value={selection} onChange={setSelection} align="end" />
        </div>
      </div>

      {/* Fleet-wide usage for the selected window */}
      <div className={['mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3', { 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }[4 + (hasBill ? 1 : 0) + (hasAiCost ? 1 : 0)]].join(' ')}>
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
        <Metric label="Active bots" value={fmt(hero.active)} subValue={`of ${rows.length} deployed`} />
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
                ? `True Twilio bill for this window — calls ${usd(bill.calls_usd)} + numbers ${usd(bill.numbers_usd)} + recordings ${usd(bill.recordings_usd)} + fees. Source: Twilio Usage Records.`
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
          + {silent} deployed bot{silent === 1 ? '' : 's'} with no recorded traffic
        </p>
      )}
    </div>
  )
}
