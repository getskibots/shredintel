import { useMemo, useState } from 'react'
import { CallTimeMetrics } from '../CallTimeMetrics'
import { DemandHeatmap } from '../DemandHeatmap'
import { KnowledgeGaps } from '../KnowledgeGaps'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { KpiStrip } from '../KpiStrip'
import { OutcomeTimeline } from '../OutcomeTimeline'
import { SectionHeader } from '../SectionHeader'
import { SectionNav } from '../SectionNav'
import { SenderMixStack } from '../SenderMixStack'
import { VoiceGeography } from '../VoiceGeography'
import { VoiceHero } from '../VoiceHero'
import { buildVoiceFixtures, type VoicePeriodKey } from '../../fixtures/voice'

const sections = [
  { id: 'call-core', number: '1', name: 'Call Core' },
  { id: 'conversation-intelligence', number: '2', name: 'Conversation Intelligence' },
  { id: 'caller-context', number: '3', name: 'Caller Context' },
  { id: 'demand', number: '4', name: 'Demand & Coverage' },
]

const PERIODS: Array<{ key: VoicePeriodKey; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
]

export function VoiceReportGrid() {
  const [period, setPeriod] = useState<VoicePeriodKey>('all')
  const f = useMemo(() => buildVoiceFixtures(period), [period])

  const tabClass = (active: boolean) =>
    active
      ? 'rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white'
      : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100'

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Voice
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Mountain Collective inbound voice AI — {f.daysInWindow}-day window.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  aria-pressed={period === p.key}
                  className={tabClass(period === p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button className="rounded-lg bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-botscrew-600">
              Export calls
            </button>
          </div>
        </div>
        <SectionNav items={sections} />
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-6 py-8">
        {/* ── § 1 Call Core ───────────────────────────────────────────── */}
        <section id="call-core" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="1"
            name="Call Core"
            tagline="What happened on the line?"
          />
          <VoiceHero
            stats={f.resolution}
            scopeLabel="Mountain Collective Voice"
            periodLabel={f.periodLabel}
            humanHandoffs={f.engagement.humanHandoffs}
            totalCalls={f.engagement.totalCalls}
          />
          <KpiStrip tiles={f.kpis} />
          <CallTimeMetrics data={f.callTime} />
          <OutcomeTimeline {...f.outcomeTimeline} />
        </section>

        {/* ── § 2 Conversation Intelligence ───────────────────────────── */}
        <section id="conversation-intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="2"
            name="Conversation Intelligence"
            tagline="What did callers actually ask about?"
          />
          <KnowledgeSourceLeaderboard
            sourcedBotMessages={f.intentTotalCalls}
            unsourcedBotMessages={Math.round(f.intentTotalCalls * 0.18)}
            knowledgeGapRate={0.18}
            topSources={f.topIntents}
            eyebrow="§ 2 Conversation Intelligence"
            title="Top call intents"
            description="Which questions are driving voice volume — pulled from the AI’s knowledge searches during calls."
            sourcedLabel="Calls with classified intent"
            sourcedSubLabel="resolved with a known answer"
            unsourcedLabel="Novel / unmatched queries"
            unsourcedSubLabel="new patterns to add to playbook"
            rateLabel="Unmatched query rate"
          />
          <KnowledgeGaps
            gaps={f.topQuestions}
            gapRate={0.18}
            eyebrow="§ 2 Conversation Intelligence"
            title="Top spoken issues to add to the AI playbook"
            description="Real callers’ words — these are the exact moments to script better AI answers or escalation rules."
            rateLabel="Coverage opportunity"
            ctaLabel="Open transcripts →"
            hideRate
          />
          <SenderMixStack {...f.senderMix} />
        </section>

        {/* ── § 3 Caller Context ──────────────────────────────────────── */}
        <section id="caller-context" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="3"
            name="Caller Context"
            tagline="Where are the calls coming from?"
          />
          <VoiceGeography rows={f.geography} />
        </section>

        {/* ── § 4 Demand & Coverage ───────────────────────────────────── */}
        <section id="demand" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="4"
            name="Demand & Coverage"
            tagline="When are callers calling — and is your AI covering it?"
          />
          <DemandHeatmap {...f.demandHeatmap} />
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · Voice channel · grounded in 20,582 real Mountain Collective calls (Jul 2025 → May 2026)
        </footer>
      </div>
    </div>
  )
}
