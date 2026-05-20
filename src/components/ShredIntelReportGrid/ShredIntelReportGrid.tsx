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
import { SectionNav } from '../SectionNav'
import { SenderMixStack } from '../SenderMixStack'
import {
  conversionPulseSample,
  demandHeatmapSample,
  deviceExperienceMixSample,
  guestIdentitySplitSample,
  knowledgeSourceLeaderboardSample,
  leadCaptureFunnelSample,
  outcomeTimelineSample,
  sampleEngagement,
  sampleFrictionPages,
  sampleKnowledgeGaps,
  sampleKpis,
  sampleResolution,
  senderMixStackSample,
} from '../../fixtures/sample'

const sections = [
  { id: 'core', number: '1', name: 'Conversation Core' },
  { id: 'intelligence', number: '2', name: 'Message Intelligence' },
  { id: 'identity', number: '3', name: 'User Identity' },
  { id: 'context', number: '4', name: 'Behavioral Context' },
]

export function ShredIntelReportGrid() {
  return (
    <div>
      {/* Page-local header — sticky beneath the dashboard top bar */}
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Analytics
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-slate-600">
              <button className="rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white">
                Last 7 days
              </button>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Last 30 days
              </button>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Custom
              </button>
            </div>
            <button className="rounded-lg bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-botscrew-600">
              Export chats
            </button>
          </div>
        </div>
        <SectionNav items={sections} />
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-6 py-8">
        {/* ── § 1 Conversation Core ───────────────────────────────── */}
        <section id="core" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="1"
            name="Conversation Core"
            tagline="What happened?"
          />
          <ResolutionHero
            stats={sampleResolution}
            scopeLabel="Jackson Hole Mountain Resort"
            periodLabel="Last 7 days · vs. prior 7"
            totalGreeted={sampleEngagement.totalConversations}
            engagementRate={sampleEngagement.engagementRate}
          />
          <KpiStrip tiles={sampleKpis} />
          <OutcomeTimeline {...outcomeTimelineSample} />
          <ConversionPulse {...conversionPulseSample} />
        </section>

        {/* ── § 2 Message Intelligence ────────────────────────────── */}
        <section id="intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="2"
            name="Message Intelligence"
            tagline="How did the bot perform?"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <KnowledgeSourceLeaderboard {...knowledgeSourceLeaderboardSample} />
            <KnowledgeGaps gaps={sampleKnowledgeGaps} gapRate={0.621} />
          </div>
          <SenderMixStack {...senderMixStackSample} />
        </section>

        {/* ── § 3 User Identity ───────────────────────────────────── */}
        <section id="identity" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="3"
            name="User Identity"
            tagline="Who's chatting?"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <GuestIdentitySplit {...guestIdentitySplitSample} />
            <LeadCaptureFunnel {...leadCaptureFunnelSample} />
          </div>
        </section>

        {/* ── § 4 Behavioral Context ──────────────────────────────── */}
        <section id="context" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="4"
            name="Behavioral Context"
            tagline="Where, how, when?"
          />
          <FrictionMap pages={sampleFrictionPages} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <DeviceExperienceMix {...deviceExperienceMixSample} />
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              Geography &amp; language breakdown is the next §4 component
              (ip_address_country · browser_language).
            </div>
          </div>
          <DemandHeatmap {...demandHeatmapSample} />
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · GSB Analytics 2.0 · concept build for Botscrew handoff
        </footer>
      </div>
    </div>
  )
}
