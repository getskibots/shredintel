import { Metric, Panel } from '../shared'
import {
  clampPercent,
  formatNumber,
  formatPercent,
  formatPercentSmart,
} from '../../lib/formatters'
import type { CallTimeMetrics as CallTimeMetricsData } from '../../fixtures/voice'

export interface CallTimeMetricsProps {
  data: CallTimeMetricsData
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return s ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

function fmtHours(hours: number): string {
  if (hours >= 1000) return `${Math.round(hours).toLocaleString()}h`
  if (hours >= 10) return `${hours.toFixed(0)}h`
  return `${hours.toFixed(1)}h`
}

export function CallTimeMetrics({ data }: CallTimeMetricsProps) {
  const {
    totalCalls,
    longestCallSeconds,
    totalTalkHours,
    avgTalkSeconds,
    medianTalkSeconds,
    totalAiHours,
    totalHumanSeconds,
    aiOnlyCalls,
    humanInvolvedCalls,
    humanHandoffRate,
    aiTalkShare,
    humanTalkShare,
    histogram,
  } = data
  const maxHist = Math.max(1, ...histogram.map((h) => h.share))

  return (
    <Panel
      eyebrow="§ 1 Call Core"
      title="Call duration & workload split"
      description="Talk-time estimates derived from message timestamps — total time on the line, distribution of call lengths, and the AI-vs-human share of that workload."
      action={
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Total talk time
          </div>
          <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-emerald-700">
            {fmtHours(totalTalkHours)}
          </div>
        </div>
      }
    >
      {/* ── Headline metrics ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Average per call"
          value={fmtDuration(avgTalkSeconds)}
          subValue="mean across all calls"
          tone="default"
        />
        <Metric
          label="Median per call"
          value={fmtDuration(medianTalkSeconds)}
          subValue="most calls are short greetings"
          tone="default"
        />
        <Metric
          label="Longest call"
          value={fmtDuration(longestCallSeconds)}
          subValue="single longest session"
          tone="accent"
        />
        <Metric
          label="AI talk-time share"
          value={formatPercentSmart(aiTalkShare)}
          subValue={`${fmtHours(totalAiHours)} of ${fmtHours(totalTalkHours)}`}
          tone="good"
        />
      </div>

      {/* ── Full length histogram (7 buckets, real distribution) ────── */}
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Call-length distribution
          </div>
          <div className="text-[10px] tabular-nums text-slate-500">
            {formatNumber(histogram.reduce((s, h) => s + h.count, 0))} calls
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {histogram.map((h, i) => {
            // Color graduates from gray (short) → emerald (long)
            const colorClasses = [
              'from-slate-400 to-slate-300',
              'from-slate-400 to-slate-300',
              'from-sky-400 to-sky-300',
              'from-sky-500 to-sky-400',
              'from-emerald-400 to-emerald-300',
              'from-emerald-500 to-emerald-400',
              'from-emerald-600 to-emerald-500',
            ]
            return (
              <div
                key={h.label}
                className="grid grid-cols-[5rem_1fr_auto] items-center gap-3"
              >
                <span className="text-xs font-medium text-slate-700">{h.label}</span>
                <div className="relative h-3 overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${colorClasses[i] ?? colorClasses[colorClasses.length - 1]}`}
                    style={{ width: `${clampPercent((h.share / maxHist) * 100)}%` }}
                  />
                </div>
                <div className="text-right text-xs tabular-nums">
                  <span className="font-semibold text-slate-800">{formatPercent(h.share)}</span>
                  <span className="ml-2 text-slate-500">{formatNumber(h.count)}</span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[10px] text-slate-400">
          ~46% of calls end within 10 seconds — likely caller greeted + immediate hang-up. Real conversations (over 30 seconds) account for {formatPercent(histogram.slice(2).reduce((s, h) => s + h.share, 0))} of volume.
        </p>
      </div>

      {/* ── AI vs Human workload split ──────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">
            AI vs Human workload
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700 tabular-nums">
              {formatNumber(totalCalls)}
            </span>{' '}
            total calls · handoff rate{' '}
            <span className="font-semibold text-slate-700 tabular-nums">
              {formatPercentSmart(humanHandoffRate)}
            </span>
          </div>
        </div>

        {/* Stacked bar */}
        <div
          className="mt-3 flex h-6 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`AI ${formatPercent(aiTalkShare)} · Human ${formatPercent(humanTalkShare)}`}
        >
          <div
            className="bg-gradient-to-r from-emerald-500 to-emerald-400"
            style={{ width: `${clampPercent(aiTalkShare * 100)}%` }}
          />
          <div
            className="bg-gradient-to-r from-violet-500 to-violet-400"
            style={{ width: `${clampPercent(humanTalkShare * 100)}%`, minWidth: humanTalkShare > 0 ? 2 : 0 }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="AI-only calls"
            value={formatNumber(aiOnlyCalls)}
            subValue={formatPercentSmart(aiOnlyCalls / Math.max(1, totalCalls))}
            tone="good"
          />
          <Metric
            label="Human-involved calls"
            value={formatNumber(humanInvolvedCalls)}
            subValue={formatPercentSmart(humanInvolvedCalls / Math.max(1, totalCalls))}
            tone="default"
          />
          <Metric
            label="AI talk-time"
            value={fmtHours(totalAiHours)}
            subValue={`${formatPercentSmart(aiTalkShare)} of total`}
            tone="good"
          />
          <Metric
            label="Human talk-time"
            value={fmtDuration(totalHumanSeconds)}
            subValue={`${formatPercentSmart(humanTalkShare)} of total`}
            tone="default"
          />
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Estimates from message timestamps, not exact phone-call duration. Human
        involvement = sender_type=SUPPORT, is_from_support=true, or
        conversation_outcome=ESCALATED.
      </p>
    </Panel>
  )
}
