import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AskBar } from '../AskBar'
import { BotSelector } from '../BotSelector'
import { ConversationCounts } from '../ConversationCounts'
import { ConversionBlockers } from '../ConversionBlockers'
import { ConversionPulse } from '../ConversionPulse'
import { GuestSentiment } from '../GuestSentiment'
import { KnowledgeSectionDemand } from '../KnowledgeSectionDemand'
import { DemandHeatmap } from '../DemandHeatmap'
import { DeviceExperienceMix } from '../DeviceExperienceMix'
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
  const { data: f, isLive, isLoading } = useBotAnalytics(botId, selection)
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
          <ShreddingOverlay active={shredding} label={askRange.label} />
          <div className={`space-y-12 transition-opacity duration-300 ${shredding ? 'opacity-60' : 'opacity-100'}`}>
            <section id="core" className="scroll-mt-40 space-y-5">
              {/* Extended Conversation Counts — the spec's §1 (sessions vs. messages, depth, bounce). */}
              <ConversationCounts {...f.conversationCounts} />
              <ConversionPulse {...f.conversionPulse} />
              {/* Benched until the SOLVED outcome derivation is settled (see reference_shredintel_data_model):
                  ResolutionHero, KpiStrip, OutcomeTimeline all read outcome=SOLVED, which is 0 for every live bot. */}
            </section>

            <section id="intelligence" className="scroll-mt-40 space-y-5">
              {/* ShredIntel enrichment — what guests ask about, where they get stuck, how they feel */}
              <KnowledgeSectionDemand {...f.knowledgeSectionDemand} botId={botId} range={askRange} />
              <ConversionBlockers {...f.conversionBlockers} botId={botId} range={askRange} />
              <GuestSentiment {...f.guestSentiment} />
              <KnowledgeSourceLeaderboard {...f.knowledgeSourceLeaderboard} />
              <SenderMixStack {...f.senderMixStack} />
            </section>

            <section id="identity" className="scroll-mt-40 space-y-5">
              <GuestIdentitySplit {...f.guestIdentitySplit} />
              <LeadCaptureFunnel {...f.leadCaptureFunnel} />
            </section>

            <section id="context" className="scroll-mt-40 space-y-5">
              <DeviceExperienceMix {...f.deviceExperienceMix} />
              <DemandHeatmap {...f.demandHeatmap} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
