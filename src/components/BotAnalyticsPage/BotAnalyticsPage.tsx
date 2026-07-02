import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ConversionPulse } from '../ConversionPulse'
import { DemandHeatmap } from '../DemandHeatmap'
import { DeviceExperienceMix } from '../DeviceExperienceMix'
import { GuestIdentitySplit } from '../GuestIdentitySplit'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { KpiStrip } from '../KpiStrip'
import { LeadCaptureFunnel } from '../LeadCaptureFunnel'
import { OutcomeTimeline } from '../OutcomeTimeline'
import { ResolutionHero } from '../ResolutionHero'
import { SectionHeader } from '../SectionHeader'
import { SectionNav } from '../SectionNav'
import { SenderMixStack } from '../SenderMixStack'
import { useAvailableBots, useBotAnalytics } from '../../data/useAnalytics'
import { type PeriodKey } from '../../fixtures/sample'

/**
 * Generic analytics dashboard for ANY bot_id. Reached via /bot/:botId
 * (BotSelector routes here for bots outside the curated set).
 *
 * Uses the same layout as ShredIntelReportGrid (all 8 report.* views).
 */
const sections = [
  { id: 'core', number: '1', name: 'Conversation Core' },
  { id: 'intelligence', number: '2', name: 'Message Intelligence' },
  { id: 'identity', number: '3', name: 'User Identity' },
  { id: 'context', number: '4', name: 'Behavioral Context' },
]

export function BotAnalyticsPage() {
  const { botId: botIdParam } = useParams<{ botId: string }>()
  const botId = Number(botIdParam)
  const [period, setPeriod] = useState<PeriodKey>('7d')
  const { data: f, isLive, isLoading } = useBotAnalytics(botId, period)
  const { bots } = useAvailableBots()

  // Show the bot's label from the registry when we know it; fall back to id.
  const bot = bots.find((b) => b.botId === botId)
  const pageTitle = bot?.label
    ? bot.label.replace(/^Bot \d+ · /, '')
    : `Bot ${botId}`

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

  const tabClass = (active: boolean) =>
    active
      ? 'rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white'
      : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100'

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Analytics <span className="text-slate-400">·</span>{' '}
              <span className="text-slate-600">{pageTitle}</span>
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
                className={isLive ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-slate-400'}
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
            </div>
          </div>
        </div>
        <SectionNav items={sections} />
      </div>

      <div className="space-y-12 px-6 py-8">
        <section id="core" className="scroll-mt-40 space-y-5">
          <SectionHeader number="1" name="Conversation Core" tagline="What happened?" />
          <ResolutionHero stats={f.resolution} scopeLabel={`Bot ${botId}`} periodLabel={f.periodLabel} />
          <KpiStrip tiles={f.kpis} />
          <OutcomeTimeline {...f.outcomeTimeline} />
          <ConversionPulse {...f.conversionPulse} />
        </section>

        <section id="intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader number="2" name="Message Intelligence" tagline="How did the bot perform?" />
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
