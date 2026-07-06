import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AskBar } from '../AskBar'
import { BotSelector } from '../BotSelector'
import { ConversationCounts } from '../ConversationCounts'
import { ConversionBlockers } from '../ConversionBlockers'
import { PageFunnel } from '../PageFunnel'
import { GuestSentiment } from '../GuestSentiment'
import { HumanHandover } from '../HumanHandover'
import { KnowledgeSectionDemand } from '../KnowledgeSectionDemand'
import { DemandHeatmap } from '../DemandHeatmap'
import { DeviceExperienceMix } from '../DeviceExperienceMix'
import { GuestLocations } from '../GuestLocations'
import { GuestIdentitySplit } from '../GuestIdentitySplit'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { LeadCaptureFunnel } from '../LeadCaptureFunnel'
import { PeriodPicker } from '../PeriodPicker'
import { SenderMixStack } from '../SenderMixStack'
import { RealtimeAgent } from '../RealtimeAgent'
import { ShreddingOverlay, useShredPulse } from '../ShreddingOverlay'
import { useBotAnalytics } from '../../data/useAnalytics'
import {
  resolveSelection,
  selectionFromSearchParams,
  writeSelectionToSearchParams,
  type PeriodSelection,
} from '../../lib/period'

/**
 * Generic analytics dashboard for ANY bot_id. Reached via /bot/:botId
 * (BotSelector routes here for bots outside the curated set).
 *
 * Uses the same layout as ShredIntelReportGrid (all 8 report.* views).
 */
export function BotAnalyticsPage() {
  const { botId: botIdParam } = useParams<{ botId: string }>()
  const botId = Number(botIdParam)
  const [searchParams, setSearchParams] = useSearchParams()
  const selection = selectionFromSearchParams(searchParams)
  const setSelection = (next: PeriodSelection) => {
    const params = writeSelectionToSearchParams(new URLSearchParams(searchParams), next)
    setSearchParams(params, { replace: true })
  }
  const { data: f, funnel, isLive, isLoading } = useBotAnalytics(botId, selection)
  // Scope the AI (ask + voice) to the same window the dashboard is showing.
  const resolved = resolveSelection(selection)
  const askRange = { from: resolved.from, to: resolved.to, label: resolved.label }
  // "Shredding the data" pulse — fires on any date-range change (both surfaces).
  const shredding = useShredPulse(`${askRange.from}|${askRange.to}`)
  const [voiceActive, setVoiceActive] = useState(false)

  if (Number.isNaN(botId)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Invalid bot id.</p>
      </div>
    )
  }
  if (isLoading || !f) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading analytics for bot {botId}…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
              Analytics
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
                className={isLive ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-slate-400'}
              />
              {isLive ? 'Live' : 'Demo'}
            </span>
          </div>
          <PeriodPicker value={selection} onChange={setSelection} align="end" />
        </div>
      </div>

      <div className="space-y-12 px-4 py-6 md:px-6 md:py-8">
        <AskBar botId={botId} range={askRange} onVoice={() => setVoiceActive(true)} />
        <RealtimeAgent
          botId={botId}
          range={askRange}
          selection={selection}
          onSelectionChange={setSelection}
          shredding={shredding}
          active={voiceActive}
          onEnd={() => setVoiceActive(false)}
        />

        {/* Data sections — the scan sweeps + dims these on any date-range change */}
        <div className="relative">
          <ShreddingOverlay active={shredding} />
          <div className={`space-y-12 transition-opacity duration-300 ${shredding ? 'opacity-60' : 'opacity-100'}`}>
            {/* 1 — Overview: how busy the assistant is + whether guests engage.
                (ResolutionHero / KpiStrip / OutcomeTimeline stay benched until the
                SOLVED outcome derivation is settled — see reference_shredintel_data_model.) */}
            <section id="overview" className="scroll-mt-40 space-y-5">
              <ConversationCounts {...f.conversationCounts} />
            </section>

            {/* 2 — Sales & conversion: where guests get stuck (by page) + what blocks
                sales (by issue). Each stage/blocker drills to its conversations —
                no global filter. Funnel is live-only. */}
            <section id="sales" className="scroll-mt-40 space-y-5">
              {funnel && <PageFunnel funnel={funnel} botId={botId} range={askRange} />}
              <ConversionBlockers {...f.conversionBlockers} botId={botId} range={askRange} />
            </section>

            {/* 3 — What guests ask about: demand by category */}
            <section id="questions" className="scroll-mt-40 space-y-5">
              <KnowledgeSectionDemand {...f.knowledgeSectionDemand} botId={botId} range={askRange} />
            </section>

            {/* 4 — Are we helping? can we answer → do humans catch the rest → are they happy */}
            <section id="service" className="scroll-mt-40 space-y-5">
              <KnowledgeSourceLeaderboard {...f.knowledgeSourceLeaderboard} />
              <HumanHandover {...f.humanHandover} />
              <GuestSentiment {...f.guestSentiment} />
            </section>

            {/* 5 — Who & where your guests are: identity, location, device, time */}
            <section id="audience" className="scroll-mt-40 space-y-5">
              <GuestIdentitySplit {...f.guestIdentitySplit} />
              <LeadCaptureFunnel {...f.leadCaptureFunnel} />
              <GuestLocations {...f.guestLocations} botId={botId} range={askRange} />
              <DeviceExperienceMix {...f.deviceExperienceMix} />
              <DemandHeatmap {...f.demandHeatmap} />
            </section>

            {/* 6 — Under the hood: message mechanics */}
            <section id="detail" className="scroll-mt-40 space-y-5">
              <SenderMixStack {...f.senderMixStack} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
