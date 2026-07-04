import { useState } from 'react'
import { ConversionPulse } from '../ConversionPulse'
import { DemandHeatmap } from '../DemandHeatmap'
import { DeviceExperienceMix } from '../DeviceExperienceMix'
import { FrictionMap } from '../FrictionMap'
import { GuestIdentitySplit } from '../GuestIdentitySplit'
import { KnowledgeGaps } from '../KnowledgeGaps'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { KpiStrip } from '../KpiStrip'
import { LeadCaptureFunnel } from '../LeadCaptureFunnel'
import { OutcomeTimeline } from '../OutcomeTimeline'
import { ResolutionHero } from '../ResolutionHero'
import { SectionHeader } from '../SectionHeader'
import { SenderMixStack } from '../SenderMixStack'
import { useJHChatAnalytics } from '../../data/useAnalytics'
import { type PeriodKey } from '../../fixtures/sample'

export function ShredIntelReportGrid() {
  const [period, setPeriod] = useState<PeriodKey>('7d')
  const { data: f, isLive, isLoading } = useJHChatAnalytics({ kind: 'preset', preset: period })

  if (isLoading || !f) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading Jackson Hole chat analytics…</p>
      </div>
    )
  }

  const tabClass = (active: boolean) =>
    active
      ? 'rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white'
      : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100'

  return (
    <div>
      {/* Page-local header — sticky beneath the dashboard top bar */}
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Analytics
            </h1>
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
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setPeriod('7d')}
                aria-pressed={period === '7d'}
                className={tabClass(period === '7d')}
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => setPeriod('30d')}
                aria-pressed={period === '30d'}
                className={tabClass(period === '30d')}
              >
                Last 30 days
              </button>
              <button
                type="button"
                disabled
                title="Custom range coming soon"
                className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium text-slate-400"
              >
                Custom
              </button>
            </div>
            <button className="rounded-lg bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-botscrew-600">
              Export chats
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-6 py-8">
        {/* ── § 1 Conversation Core ───────────────────────────────── */}
        <section id="core" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="1"
            name="Conversation Core"
            tagline="What happened?"
          />
          <ResolutionHero
            stats={f.resolution}
            scopeLabel="Jackson Hole Mountain Resort"
            periodLabel={f.periodLabel}
          />
          <KpiStrip tiles={f.kpis} />
          <OutcomeTimeline {...f.outcomeTimeline} />
          <ConversionPulse {...f.conversionPulse} />
        </section>

        {/* ── § 2 Message Intelligence ────────────────────────────── */}
        <section id="intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="2"
            name="Message Intelligence"
            tagline="How did the bot perform?"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <KnowledgeSourceLeaderboard {...f.knowledgeSourceLeaderboard} />
            <KnowledgeGaps gaps={f.knowledgeGaps} gapRate={f.knowledgeSourceLeaderboard.knowledgeGapRate} />
          </div>
          <SenderMixStack {...f.senderMixStack} />
        </section>

        {/* ── § 3 User Identity ───────────────────────────────────── */}
        <section id="identity" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="3"
            name="User Identity"
            tagline="Who's chatting?"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <GuestIdentitySplit {...f.guestIdentitySplit} />
            <LeadCaptureFunnel {...f.leadCaptureFunnel} />
          </div>
        </section>

        {/* ── § 4 Behavioral Context ──────────────────────────────── */}
        <section id="context" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="4"
            name="Behavioral Context"
            tagline="Where, how, when?"
          />
          <FrictionMap pages={f.frictionPages} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <DeviceExperienceMix {...f.deviceExperienceMix} />
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              Geography &amp; language breakdown is the next §4 component
              (ip_address_country · browser_language).
            </div>
          </div>
          <DemandHeatmap {...f.demandHeatmap} />
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · GSB Analytics 2.0 · concept build for Botscrew handoff
        </footer>
      </div>
    </div>
  )
}
