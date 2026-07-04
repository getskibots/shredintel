import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, Metric, Panel } from '../shared'
import type { MetricProps } from '../shared/Metric'
import { chart } from '../../lib/chartTheme'
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
    label: 'Conversations',
    value: formatNumber(sessions),
    sub: convosPerUser ? `${convosPerUser.toFixed(1)} per user` : 'chats started',
    tone: users != null ? 'neutral' : 'accent',
  })
  tiles.push({
    label: 'Engaged',
    value: formatNumber(engagedSessions),
    sub: `${formatPercent(engagedShare)} of conversations`,
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
  tiles.push({
    label: 'First response',
    value: formatDuration(responseSec),
    sub: responseLabel,
    tone: 'neutral',
  })

  return (
    <Panel
      eyebrow="§ 1 Conversation Core"
      title="Conversation funnel"
      description="Visitors → conversations → engaged → real questions. Users matches the “Active users” count in your admin."
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

          <div className="mt-5 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...chart.grid} />
                <XAxis dataKey="date" {...chart.xAxis} />
                <YAxis {...chart.yAxis} />
                <Tooltip
                  {...chart.tooltip}
                  formatter={(value, name) => [formatNumber(Number(value)), name]}
                />
                <Bar dataKey="sessions" name="Conversations" {...chart.bar} maxBarSize={26} />
                <Line dataKey="messages" name="Messages" {...chart.line} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {users != null && (
              <>
                <span className="font-semibold text-slate-700">{formatNumber(users)}</span> visitors started{' '}
                <span className="font-semibold text-slate-700">{formatNumber(sessions)}</span> conversations —{' '}
              </>
            )}
            <span className="font-semibold text-slate-700">{formatPercent(engagedShare)}</span> engaged
            {substantive != null && (
              <>
                {' '}and <span className="font-semibold text-slate-700">{formatNumber(substantive)}</span> asked a real
                question (ShredIntel’s analysis base)
              </>
            )}
            . {messagesPerSession.toFixed(1)} messages per conversation; {formatPercent(singleMsgShareOfEngaged)} were
            one-and-done.
          </p>
        </>
      )}
    </Panel>
  )
}
