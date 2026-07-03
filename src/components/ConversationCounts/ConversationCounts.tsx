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
 * § 1 — Extended Conversation Counts.
 * The volume + depth story: sessions vs. messages, how deep guests go, and how
 * many bounce after a single message. Sourced from report.conversation_depth.
 */
export function ConversationCounts({
  sessions,
  messages,
  userMessages,
  engagedSessions,
  singleUserMsgSessions,
  singleMsgShareOfEngaged,
  messagesPerSession,
  userMessagesPerSession,
  avgFirstResponseSec,
  medianFirstResponseSec,
  trend,
}: ConversationCountsProps) {
  const empty = sessions === 0 && messages === 0
  const engagedShare = sessions > 0 ? engagedSessions / sessions : 0
  const responseSec = medianFirstResponseSec ?? avgFirstResponseSec
  const responseLabel =
    medianFirstResponseSec != null ? 'median' : avgFirstResponseSec != null ? 'avg' : 'coming soon'

  return (
    <Panel
      eyebrow="§ 1 Conversation Core"
      title="Conversation volume & depth"
      description="Sessions vs. messages, how deep guests go, and single-message bounces."
    >
      {empty ? (
        <EmptyState
          title="No conversations in the selected range."
          message="Nothing to summarize for this period yet."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Sessions"
              value={formatNumber(sessions)}
              subValue="conversations"
              tone="accent"
            />
            <Metric
              label="Messages"
              value={formatNumber(messages)}
              subValue={`${formatNumber(userMessages)} from guests`}
            />
            <Metric
              label="Msgs / session"
              value={messagesPerSession.toFixed(1)}
              subValue={`${userMessagesPerSession.toFixed(1)} from guest`}
            />
            <Metric
              label="Engaged"
              value={formatNumber(engagedSessions)}
              subValue={`${formatPercent(engagedShare)} of sessions`}
              tone="good"
            />
            <Metric
              label="Single-message"
              value={formatPercent(singleMsgShareOfEngaged)}
              subValue={`${formatNumber(singleUserMsgSessions)} one-and-done`}
              tone="warn"
            />
            <Metric
              label="First response"
              value={formatDuration(responseSec)}
              subValue={responseLabel}
              tone="neutral"
            />
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
                <Bar dataKey="sessions" name="Sessions" {...chart.bar} maxBarSize={26} />
                <Line dataKey="messages" name="Messages" {...chart.line} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{messagesPerSession.toFixed(1)}</span>{' '}
            messages per session, with{' '}
            <span className="font-semibold text-slate-700">
              {userMessagesPerSession.toFixed(1)}
            </span>{' '}
            from the guest — {formatPercent(engagedShare)} of sessions had the guest reply at least once.
          </p>
        </>
      )}
    </Panel>
  )
}
