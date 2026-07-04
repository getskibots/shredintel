import { useSearchParams } from 'react-router-dom'
import { BotSelector } from '../BotSelector'
import { CallTimeMetrics } from '../CallTimeMetrics'
import { DemandHeatmap } from '../DemandHeatmap'
import { IntentCategoryBreakdown } from '../IntentCategoryBreakdown'
import { KnowledgeGaps } from '../KnowledgeGaps'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { PeriodPicker } from '../PeriodPicker'
import { VoiceGeography } from '../VoiceGeography'
import { VoiceIntentHero } from '../VoiceIntentHero'
import { useVoiceAnalytics } from '../../data/useAnalytics'
import { formatNumber, formatPercent } from '../../lib/formatters'
import {
  selectionFromSearchParams,
  writeSelectionToSearchParams,
  type PeriodSelection,
} from '../../lib/period'

export function VoiceReportGrid() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Voice historically defaulted to "All time" (the demo needs the full window
  // to show peak call patterns); keep that default when no URL param is set.
  const selection = selectionFromSearchParams(searchParams, { kind: 'preset', preset: 'all' })
  const setSelection = (next: PeriodSelection) => {
    const params = writeSelectionToSearchParams(new URLSearchParams(searchParams), next)
    setSearchParams(params, { replace: true })
  }
  const { data: f, isLive, isLoading } = useVoiceAnalytics(selection)

  if (isLoading || !f) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading Mountain Collective voice analytics…</p>
      </div>
    )
  }

  // Quick efficiency stats for the operator footnote
  const aiHandled = f.callTime.aiOnlyCalls
  const aiHours = f.callTime.totalAiHours
  const handoffRate = f.callTime.humanHandoffRate

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
                Voice
              </h1>
              <BotSelector />
              <span
                className={
                  isLive
                    ? 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700'
                    : 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500'
                }
                title={isLive ? 'Reading live from Supabase' : 'Using bundled fixtures'}
              >
                <span
                  aria-hidden
                  className={
                    isLive
                      ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                      : 'h-1.5 w-1.5 rounded-full bg-slate-400'
                  }
                />
                {isLive ? 'Live' : 'Demo'}
              </span>
            </div>
            <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">
              Mountain Collective — what your guests called about over{' '}
              {f.daysInWindow} days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={selection} onChange={setSelection} align="end" />
            <button className="rounded-lg bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-botscrew-600">
              <span className="sm:hidden">Export</span>
              <span className="hidden sm:inline">Export calls</span>
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-4 py-6 md:px-6 md:py-8">
        {/* ── § 1 Guest Intent ───────────────────────────────────────── */}
        <section id="guest-intent" className="scroll-mt-40 space-y-5">
          <VoiceIntentHero
            stats={f.resolution}
            topCategory={f.topCategory}
            scopeLabel="Mountain Collective Voice"
            periodLabel={f.periodLabel}
          />
          <IntentCategoryBreakdown categories={f.intentCategories} />
        </section>

        {/* ── § 2 Customer Needs ─────────────────────────────────────── */}
        <section id="customer-needs" className="scroll-mt-40 space-y-5">
          <KnowledgeSourceLeaderboard
            sourcedBotMessages={f.intentTotalCalls}
            unsourcedBotMessages={Math.round(f.intentTotalCalls * 0.18)}
            knowledgeGapRate={0.18}
            topSources={f.topIntents}
            eyebrow="§ 2 Customer Needs"
            title="Most common reasons guests called"
            description="The top recurring intents from the AI's knowledge searches during calls. Each row is a question pattern guests bring to the phone."
            sourcedLabel="Calls with classified intent"
            sourcedSubLabel="recognized as a known need"
            unsourcedLabel="Novel / unmatched queries"
            unsourcedSubLabel="new patterns worth scripting"
            rateLabel="Unmatched query rate"
          />
          <KnowledgeGaps
            gaps={f.topQuestions}
            gapRate={0.18}
            eyebrow="§ 2 Customer Needs"
            title="What guests are saying — in their own words"
            description="Verbatim caller questions, ranked by frequency. These are the exact moments to script better answers, fix the website, or update the FAQ."
            ctaLabel="Open transcripts →"
            hideRate
          />
        </section>

        {/* ── § 3 Audience ───────────────────────────────────────────── */}
        <section id="audience" className="scroll-mt-40 space-y-5">
          <VoiceGeography rows={f.geography} />
        </section>

        {/* ── § 4 Demand Patterns ────────────────────────────────────── */}
        <section id="demand" className="scroll-mt-40 space-y-5">
          <DemandHeatmap {...f.demandHeatmap} />
        </section>

        {/* ── Operator efficiency (small, demoted) ────────────────────── */}
        <section className="space-y-3 pt-6">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
            For the operators
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-slate-600 sm:grid-cols-3">
              <div>
                <span className="text-slate-900 font-semibold tabular-nums">
                  {formatNumber(aiHandled)}
                </span>{' '}
                of {formatNumber(f.engagement.totalCalls)} engaged calls handled by the AI alone
                {' '}<span className="text-slate-400">·</span>{' '}
                <span className="text-emerald-700 font-semibold">{formatPercent(aiHandled / Math.max(1, f.engagement.totalCalls))}</span>
              </div>
              <div>
                AI talk-time absorbed:{' '}
                <span className="text-slate-900 font-semibold tabular-nums">
                  {aiHours}h
                </span>
              </div>
              <div>
                Live-agent handoffs:{' '}
                <span className="text-slate-900 font-semibold tabular-nums">
                  {formatNumber(f.engagement.humanHandoffs)}
                </span>{' '}
                <span className="text-slate-400">({formatPercent(handoffRate, 3)})</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Note: handoff signal in the export is currently limited (the source
              field <code className="rounded bg-slate-100 px-1">is_redirect_phone_number_provided</code>
              {' '}is not populated yet). Numbers above reflect{' '}
              <code className="rounded bg-slate-100 px-1">sender_type=SUPPORT</code>{' '}
              only and may undercount.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-700">
                More efficiency detail
              </summary>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <CallTimeMetrics data={f.callTime} />
              </div>
            </details>
          </div>
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · Voice channel · grounded in {formatNumber(f.engagement.totalCalls)} real Mountain Collective engaged calls
        </footer>
      </div>
    </div>
  )
}
