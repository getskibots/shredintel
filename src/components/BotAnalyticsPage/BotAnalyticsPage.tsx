import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AskBar } from '../AskBar'
import { BotSelector } from '../BotSelector'
import { ChatFaqAudit } from '../ChatFaqAudit'
import { ConversationCounts } from '../ConversationCounts'
import { ConversionBlockers } from '../ConversionBlockers'
import { PageFunnel } from '../PageFunnel'
import { GuestSentiment } from '../GuestSentiment'
import { HumanHandover } from '../HumanHandover'
import { NeedsAttention } from '../NeedsAttention'
import { EmptyRange } from '../EmptyRange/EmptyRange'
import { KnowledgeSectionDemand } from '../KnowledgeSectionDemand'
import { DemandHeatmap } from '../DemandHeatmap'
import { DeviceExperienceMix } from '../DeviceExperienceMix'
import { GuestLocations } from '../GuestLocations'
import { GuestIdentitySplit } from '../GuestIdentitySplit'
import { PeriodPicker } from '../PeriodPicker'
import { SenderMixStack } from '../SenderMixStack'
import { RealtimeAgent } from '../RealtimeAgent'
import { ChannelToggle } from '../ChannelToggle/ChannelToggle'
import { omniGroupByKey } from '../../lib/omniGroups'
import { ShreddingOverlay, useShredPulse } from '../ShreddingOverlay'
import { useBotAnalytics, useAvailableBots } from '../../data/useAnalytics'
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
  const omniGroup = omniGroupByKey(searchParams.get('omni'))
  const setSelection = (next: PeriodSelection) => {
    const params = writeSelectionToSearchParams(new URLSearchParams(searchParams), next)
    setSearchParams(params, { replace: true })
  }
  const { data: f, funnel, isLoading, isEmpty } = useBotAnalytics(botId, selection)
  const { bots } = useAvailableBots()
  const botName = bots.find((b) => b.botId === botId)?.label
  // Scope the AI (ask + voice) to the same window the dashboard is showing.
  const resolved = resolveSelection(selection)
  const askRange = { from: resolved.from, to: resolved.to, label: resolved.label }
  // "Shredding the data" pulse — fires on any date-range change (both surfaces).
  const shredding = useShredPulse(`${askRange.from}|${askRange.to}`)
  const [voiceActive, setVoiceActive] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  // Bento: single column below lg, 12-col grid at lg+. Cards declare a span
  // (col-span-6 = paired, col-span-12 = full row). items-start keeps each card
  // its natural height instead of stretching to its row-mate.
  const bentoGrid = 'grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start'
  // Same idea, but pairs only at xl (1280). Used where the paired cards have
  // their OWN two-column internals (donut + detail) that need real width — at
  // the lg boundary a half-width card is too tight for the inner split, so we
  // keep those full-width until xl.
  const bentoGridWide = 'grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start'

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
        <p className="text-sm text-slate-500">Loading {botName ?? `bot ${botId}`}…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {omniGroup && <ChannelToggle group={omniGroup} active="chat" />}
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
              Analytics
            </h1>
            {!omniGroup && <BotSelector />}
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
          {isEmpty ? (
            <EmptyRange
              botName={botName ?? `Bot ${botId}`}
              periodLabel={askRange.label}
              onViewAll={() => setSelection({ kind: 'preset', preset: 'all' })}
            />
          ) : (
          <div className={`space-y-12 transition-opacity duration-300 ${shredding ? 'opacity-60' : 'opacity-100'}`}>
            {/* 1 — Overview: how busy the assistant is + whether guests engage.
                (ResolutionHero / KpiStrip / OutcomeTimeline stay benched until the
                SOLVED outcome derivation is settled — see reference_shredintel_data_model.) */}
            <section id="overview" className="scroll-mt-40 space-y-5">
              <ConversationCounts {...f.conversationCounts} />
            </section>

            {/* 2 — Sales & conversion: where guests get stuck (by page) + what blocks
                sales (by issue). Paired side-by-side at lg+ so the two friction
                views read together; stacks full-width below lg so the bars never
                cramp. Each stage/blocker drills to its conversations (a modal, so
                card width doesn't constrain it). Funnel is live-only. */}
            <section id="sales" className="scroll-mt-40">
              {/* Direct grid children (no wrapper div) so the two cards stretch to
                  the SAME height automatically — grid's default align-items:stretch.
                  Right card is trimmed (top 7 blockers + collapsed tips) so the
                  match lands without a hollow left card. */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                {funnel && (
                  <PageFunnel funnel={funnel} botId={botId} range={askRange} className="lg:col-span-6" />
                )}
                <ConversionBlockers
                  {...f.conversionBlockers}
                  botId={botId}
                  range={askRange}
                  className={funnel ? 'lg:col-span-6' : 'lg:col-span-12'}
                />
              </div>
            </section>

            {/* 3 — Knowledge: what guests ask about (demand by topic) merged with
                answer coverage (sourced vs unsourced + the knowledge-gap rate).
                Per-topic coverage lands in a follow-up. */}
            <section id="questions" className="scroll-mt-40 space-y-5">
              <KnowledgeSectionDemand
                {...f.knowledgeSectionDemand}
                layers={f.knowledgeLayers}
                botId={botId}
                range={askRange}
              />
            </section>

            {/* 4 — Service quality: do humans catch what the bot can't → are guests
                happy. Handover + sentiment pair as two compact ratio views.
                (Knowledge coverage moved up into the Knowledge card in band 3.) */}
            <section id="service" className="scroll-mt-40 space-y-5">
              <NeedsAttention {...f.needsAttention} botId={botId} range={askRange} />
              <div className={bentoGrid}>
                <div className="lg:col-span-6">
                  <HumanHandover {...f.humanHandover} />
                </div>
                <div className="lg:col-span-6">
                  <GuestSentiment {...f.guestSentiment} botId={botId} range={askRange} />
                </div>
              </div>
            </section>

            {/* 5 — Who & where your guests are: identity + device pair up (compact
                donut panels); lead capture, the location map, and the day/hour
                heatmap each take a full row (they need the width). */}
            <section id="audience" className="scroll-mt-40">
              <div className={bentoGridWide}>
                <div className="xl:col-span-6">
                  <GuestIdentitySplit {...f.guestIdentitySplit} />
                </div>
                <div className="xl:col-span-6">
                  <DeviceExperienceMix {...f.deviceExperienceMix} />
                </div>
                <div className="xl:col-span-12">
                  <GuestLocations {...f.guestLocations} botId={botId} range={askRange} />
                </div>
                <div className="xl:col-span-12">
                  <DemandHeatmap {...f.demandHeatmap} />
                </div>
              </div>
            </section>

            {/* 6 — Under the hood: message mechanics */}
            <section id="detail" className="scroll-mt-40 space-y-5">
              <SenderMixStack {...f.senderMixStack} />
            </section>
          </div>
          )}
        </div>
      </div>

      {/* Discreet corner entry point — faint, all-caps, bottom-right. There when
          you want it, invisible to a partner scanning the page. */}
      <button
        onClick={() => setAuditOpen(true)}
        className="fixed bottom-3 right-4 z-30 text-[10px] font-medium uppercase tracking-wider text-slate-300 transition hover:text-slate-500"
        title="Pepper this bot with test questions"
      >
        Ahhh FAQ It
      </button>

      <ChatFaqAudit
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        botLabel={botId === 43 ? 'Jackson Hole' : `Bot ${botId}`}
      />
    </div>
  )
}
