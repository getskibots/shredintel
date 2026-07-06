import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import type { MetricProps } from '../shared/Metric'
import { brand, chart } from '../../lib/chartTheme'
import { formatNumber, formatPercent } from '../../lib/formatters'
import type { ConversationCountsProps } from '../../types/analytics'

export type { ConversationCountsProps } from '../../types/analytics'

function formatDuration(sec: number | null): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec % 1 === 0 ? sec : sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s}s`
}

/**
 * § 1 — Conversation funnel. The volume story as a reconciling funnel:
 * Users (matches the Botscrew admin "Active users") → Conversations → Engaged →
 * Real questions (the AI's substantive base). Sourced from
 * report.conversation_depth + report.active_users + Σ report.intel_section.
 */
export function ConversationCounts({
  users,
  substantive,
  sessions,
  messages,
  userMessages,
  engagedSessions,
  singleMsgShareOfEngaged,
  messagesPerSession,
  avgFirstResponseSec,
  medianFirstResponseSec,
  trend,
}: ConversationCountsProps) {
  const empty = sessions === 0 && messages === 0
  const engagedShare = sessions > 0 ? engagedSessions / sessions : 0
  const substantiveShareOfEngaged = engagedSessions > 0 && substantive != null ? substantive / engagedSessions : 0
  const convosPerUser = users && users > 0 ? sessions / users : 0
  const responseSec = medianFirstResponseSec ?? avgFirstResponseSec
  const responseLabel =
    medianFirstResponseSec != null ? 'median' : avgFirstResponseSec != null ? 'avg' : 'coming soon'

  type Tile = { label: string; value: string; sub: string; tone: MetricProps['tone'] }
  const tiles: Tile[] = []
  if (users != null) {
    tiles.push({ label: 'Users', value: formatNumber(users), sub: 'unique visitors', tone: 'accent' })
  }
  tiles.push({
    label: 'Chats opened',
    value: formatNumber(sessions),
    sub: convosPerUser ? `${convosPerUser.toFixed(1)} per user` : 'chats started',
    tone: users != null ? 'neutral' : 'accent',
  })
  tiles.push({
    label: 'Engaged',
    value: formatNumber(engagedSessions),
    sub: `guest replied · ${formatPercent(engagedShare)}`,
    tone: 'good',
  })
  if (substantive != null) {
    tiles.push({
      label: 'Real questions',
      value: formatNumber(substantive),
      sub: `${formatPercent(substantiveShareOfEngaged)} of engaged · what ShredIntel analyzes`,
      tone: 'good',
    })
  }
  tiles.push({
    label: 'Messages',
    value: formatNumber(messages),
    sub: `${formatNumber(userMessages)} from guests`,
    tone: 'neutral',
  })
  // Only show First response once we actually have the number — no "coming
  // soon" placeholder. Reappears automatically when the response-time
  // enrichment lands.
  if (responseSec != null) {
    tiles.push({
      label: 'First response',
      value: formatDuration(responseSec),
      sub: responseLabel,
      tone: 'neutral',
    })
  }

  return (
    <Panel
      eyebrow="Overview"
      title="Activity & engagement"
      description="How many visitors turn into real conversations: visitors → chats opened → engaged (guest replied) → real questions. “Users” matches the Active-users count in your admin."
    >
      {empty ? (
        <EmptyState
          title="No conversations in the selected range."
          message="Nothing to summarize for this period yet."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <Metric key={t.label} label={t.label} value={t.value} subValue={t.sub} tone={t.tone} />
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: '#DCE7F1', outline: '1px solid #AFC3D8' }} /> Chats opened
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: brand.blue }} /> Engaged
              </span>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...chart.grid} />
                  <XAxis dataKey="date" {...chart.xAxis} />
                  <YAxis {...chart.yAxis} />
                  <Tooltip
                    {...chart.tooltip}
                    formatter={(value, name) => [formatNumber(Number(value)), name]}
                  />
                  {/* Chats opened = light backdrop; Engaged nested inside; the gap = bounce. */}
                  <Area type="monotone" dataKey="sessions" name="Chats opened" stroke="#AFC3D8" strokeWidth={1} fill="#DCE7F1" fillOpacity={1} />
                  <Area type="monotone" dataKey="engaged" name="Engaged" stroke={brand.blue} strokeWidth={1.5} fill={brand.blue} fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {users != null && (
              <>
                <span className="font-semibold text-slate-700">{formatNumber(users)}</span> visitors opened{' '}
                <span className="font-semibold text-slate-700">{formatNumber(sessions)}</span> chats —{' '}
              </>
            )}
            <span className="font-semibold text-slate-700">{formatPercent(engagedShare)}</span> engaged
            {substantive != null && (
              <>
                {' '}and <span className="font-semibold text-slate-700">{formatNumber(substantive)}</span> asked a real
                question (ShredIntel’s analysis base)
              </>
            )}
            . {messagesPerSession.toFixed(1)} messages per chat; {formatPercent(singleMsgShareOfEngaged)} were
            one-and-done.
          </p>
        </>
      )}
    </Panel>
  )
}
