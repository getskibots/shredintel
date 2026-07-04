import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AskBar } from '../AskBar'
import { SavedReportsModal } from '../SavedReports'
import { listSavedReports } from '../../lib/savedReports'
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
import { SectionHeader } from '../SectionHeader'
import { SenderMixStack } from '../SenderMixStack'
import { RealtimeAgent } from '../RealtimeAgent'
import { useBotAnalytics } from '../../data/useAnalytics'
import {
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
  const [voiceActive, setVoiceActive] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  useEffect(() => {
    setSavedCount(listSavedReports(botId).length)
  }, [botId, voiceActive, savedOpen])

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
        <div>
          <AskBar botId={botId} onVoice={() => setVoiceActive(true)} />
          <div className="mx-auto mt-3 flex max-w-3xl justify-end px-1">
            <button
              type="button"
              onClick={() => setSavedOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              <Bookmark className="h-3.5 w-3.5" /> Saved reports{savedCount ? ` (${savedCount})` : ''}
            </button>
          </div>
        </div>
        <RealtimeAgent botId={botId} active={voiceActive} onEnd={() => setVoiceActive(false)} />
        {savedOpen && <SavedReportsModal botId={botId} onClose={() => setSavedOpen(false)} />}

        <section id="core" className="scroll-mt-40 space-y-5">
          <SectionHeader number="1" name="Conversation Core" tagline="What happened?" />
          {/* Extended Conversation Counts — the spec's §1 (sessions vs. messages, depth, bounce). */}
          <ConversationCounts {...f.conversationCounts} />
          <ConversionPulse {...f.conversionPulse} />
          {/* Benched until the SOLVED outcome derivation is settled (see reference_shredintel_data_model):
              ResolutionHero, KpiStrip, OutcomeTimeline all read outcome=SOLVED, which is 0 for every live bot. */}
        </section>

        <section id="intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader number="2" name="Message Intelligence" tagline="How did the bot perform?" />
          {/* ShredIntel enrichment — what guests ask about, where they get stuck, how they feel */}
          <KnowledgeSectionDemand {...f.knowledgeSectionDemand} botId={botId} />
          <ConversionBlockers {...f.conversionBlockers} botId={botId} />
          <GuestSentiment {...f.guestSentiment} />
          <KnowledgeSourceLeaderboard {...f.knowledgeSourceLeaderboard} />
          <SenderMixStack {...f.senderMixStack} />
        </section>

        <section id="identity" className="scroll-mt-40 space-y-5">
          <SectionHeader number="3" name="User Identity" tagline="Who's chatting?" />
          <GuestIdentitySplit {...f.guestIdentitySplit} />
          <LeadCaptureFunnel {...f.leadCaptureFunnel} />
        </section>

        <section id="context" className="scroll-mt-40 space-y-5">
          <SectionHeader number="4" name="Behavioral Context" tagline="Where, how, when?" />
          <DeviceExperienceMix {...f.deviceExperienceMix} />
          <DemandHeatmap {...f.demandHeatmap} />
        </section>
      </div>
    </div>
  )
}
