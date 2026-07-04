import { useState } from 'react'
import { DemandHeatmap } from '../DemandHeatmap'
import { FrictionMap } from '../FrictionMap'
import { IntentCategoryBreakdown } from '../IntentCategoryBreakdown'
import { KnowledgeGaps } from '../KnowledgeGaps'
import { KnowledgeSourceLeaderboard } from '../KnowledgeSourceLeaderboard'
import { VoiceGeography } from '../VoiceGeography'
import { VoiceIntentHero } from '../VoiceIntentHero'
import { useMCChatAnalytics } from '../../data/useAnalytics'
import {
  type ChatCustomerNeedCategory,
  type IntentCategorySummary,
  type MCChatPeriodKey,
} from '../../fixtures/mc-chat'
import { clampPercent, formatNumber, formatPercent } from '../../lib/formatters'

const PERIODS: Array<{ key: MCChatPeriodKey; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '180d', label: 'Last 180 days' },
  { key: 'all', label: 'All time' },
]

/**
 * Adapter that maps MCChat's ChatCustomerNeedCategory shape into the voice
 * IntentCategoryBreakdown's shape. They look identical but TS treats the
 * category enums as separate types.
 */
function ChatIntentBreakdown({ categories }: { categories: IntentCategorySummary[] }) {
  // Re-use the voice palette but key it to chat categories.
  const CHAT_COLORS: Record<ChatCustomerNeedCategory, string> = {
    'Pass Delivery & Logistics': '#0EA5E9', // sky
    'Purchase & Checkout': '#7C3AED',       // violet
    'Friends & Family / Promos': '#F59E0B', // amber
    'Account & Login': '#10B981',           // emerald
    'Resort Info & Use': '#6366F1',         // indigo
    'Other / Long-tail': '#CBD5E1',
  }
  const NOTES: Partial<Record<ChatCustomerNeedCategory, string>> = {
    'Pass Delivery & Logistics': 'When will pass arrive, how to use it, reprints',
    'Purchase & Checkout': 'Stuck modals, popup-blocked purchases',
    'Friends & Family / Promos': 'F&F discounts, referral perks, bonus days',
    'Account & Login': 'Email changes, login lookups',
    'Resort Info & Use': 'Pass page, FAQs, resort details',
    'Other / Long-tail': 'Many topics, each <1% of volume',
  }
  if (!categories.length) return null
  const total = categories.reduce((s, c) => s + c.conversations, 0)
  const problemCats: ChatCustomerNeedCategory[] = [
    'Pass Delivery & Logistics',
    'Purchase & Checkout',
    'Account & Login',
    'Friends & Family / Promos',
  ]
  const problemShare = total > 0 ? categories
    .filter((c) => problemCats.includes(c.category))
    .reduce((s, c) => s + c.conversations, 0) / total : 0

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-botscrew-500">
            Guest Intent
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            What your guests are chatting about
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Customer needs grouped from the bot's knowledge sources. "Pass
            delivery" dominates — guests want to know when their pass arrives,
            and what to do when it doesn't.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Problem-resolution share
          </div>
          <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">
            {formatPercent(problemShare)}
          </div>
        </div>
      </header>

      <ul className="mt-5 space-y-3">
        {categories.map((c) => (
          <li
            key={c.category}
            className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[14rem_1fr_auto]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: CHAT_COLORS[c.category] }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  {c.category}
                </div>
                {NOTES[c.category] && (
                  <div className="truncate text-[10px] text-slate-500">
                    {NOTES[c.category]}
                  </div>
                )}
              </div>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${clampPercent(c.share * 100)}%`,
                  background: CHAT_COLORS[c.category],
                }}
              />
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="font-semibold text-slate-800">
                {formatPercent(c.share)}
              </div>
              <div className="text-slate-500">{formatNumber(c.conversations)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MCChatReportGrid() {
  // Avoid the unused-import warning on IntentCategoryBreakdown — kept for
  // visual parity with the voice page in case we want to lift it later.
  void IntentCategoryBreakdown

  const [period, setPeriod] = useState<MCChatPeriodKey>('all')
  const { data: f, isLive, isLoading } = useMCChatAnalytics(period)

  if (isLoading || !f) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading Mountain Collective chat analytics…</p>
      </div>
    )
  }

  const tabClass = (active: boolean) =>
    active
      ? 'rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white'
      : 'rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100'

  // Map top friction pages into the FrictionMap shape
  const frictionPages = f.topPages

  // Device summary line
  const mobile = f.devices.find((d) => d.device === 'Mobile')
  const desktop = f.devices.find((d) => d.device === 'Desktop')

  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Chat — Mountain Collective
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
            <p className="mt-0.5 text-xs text-slate-500">
              What your guests asked the chat assistant over {f.daysInWindow} days.
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
              Export chats
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-12 px-6 py-8">
        {/* ── § 1 Guest Intent ───────────────────────────────────────── */}
        <section id="guest-intent" className="scroll-mt-40 space-y-5">
          <VoiceIntentHero
            stats={f.resolution}
            topCategory={f.topCategory as never /* shapes match */}
            scopeLabel="Mountain Collective · Chat"
            periodLabel={f.periodLabel}
            headline="Why your guests chatted"
            unitLabel="engaged chats"
            reasonVerb="chatted about"
            trendLabel="Chat volume"
          />
          <ChatIntentBreakdown categories={f.intentCategories} />
        </section>

        {/* ── § 2 Customer Needs ─────────────────────────────────────── */}
        <section id="customer-needs" className="scroll-mt-40 space-y-5">
          <KnowledgeSourceLeaderboard
            sourcedBotMessages={f.intentTotalMessages}
            unsourcedBotMessages={Math.round(f.intentTotalMessages * 0.4)}
            knowledgeGapRate={f.engagement.knowledgeGapRate}
            topSources={f.topIntents}
            eyebrow="§ 2 Customer Needs"
            title="Most common reasons guests chatted"
            description="The top knowledge sources powering the bot's answers. Each row is a question pattern guests keep bringing to the chat assistant."
            sourcedLabel="Sourced answers"
            sourcedSubLabel="bot replied with a KB reference"
            unsourcedLabel="Unsourced answers"
            unsourcedSubLabel="bot answered without a KB reference"
            rateLabel="Knowledge-gap rate"
          />
          <KnowledgeGaps
            gaps={f.topQuestions}
            gapRate={f.engagement.knowledgeGapRate}
            eyebrow="§ 2 Customer Needs"
            title="What guests typed — in their own words"
            description="Verbatim guest messages, ranked by how often they came up. These are the exact moments to fix the website, update the FAQ, or sharpen the bot's playbook."
            ctaLabel="Open transcripts →"
            hideRate
          />
          <FrictionMap pages={frictionPages} />
        </section>

        {/* ── § 3 Audience ───────────────────────────────────────────── */}
        <section id="audience" className="scroll-mt-40 space-y-5">
          <VoiceGeography rows={f.geography} />
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-botscrew-500">
              Audience
            </div>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
              Device mix
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Roughly half mobile, half desktop. Different from voice (phone-only)
              and Jackson Hole chat (mobile-heavy) — MC users skew more desktop,
              probably because purchases happen on bigger screens.
            </p>
            <ul className="mt-5 space-y-3">
              {f.devices.map((d) => (
                <li
                  key={d.device}
                  className="grid grid-cols-[100px_1fr_auto] items-center gap-3"
                >
                  <span className="text-sm font-medium text-slate-700">{d.device}</span>
                  <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                      style={{ width: `${clampPercent(d.share * 100)}%` }}
                    />
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <div className="font-semibold text-slate-800">
                      {formatPercent(d.share)}
                    </div>
                    <div className="text-slate-500">{formatNumber(d.conversations)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
                  {formatNumber(f.engagement.resolvedConversations)}
                </span>{' '}
                of {formatNumber(f.engagement.engagedConversations)} engaged chats resolved
                {' '}<span className="text-slate-400">·</span>{' '}
                <span className="text-emerald-700 font-semibold">
                  {formatPercent(f.engagement.resolutionRate)}
                </span>
              </div>
              <div>
                Engagement rate:{' '}
                <span className="text-slate-900 font-semibold tabular-nums">
                  {formatPercent(f.engagement.engagementRate)}
                </span>{' '}
                <span className="text-slate-400">
                  ({formatNumber(f.engagement.engagedConversations)} of {formatNumber(f.engagement.totalConversations)} chats)
                </span>
              </div>
              <div>
                Mobile {mobile ? formatPercent(mobile.share) : '—'} · Desktop{' '}
                {desktop ? formatPercent(desktop.share) : '—'}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Knowledge-gap rate (bot answers with no KB reference):{' '}
              <span className="font-semibold text-slate-600">
                {formatPercent(f.engagement.knowledgeGapRate)}
              </span>
              . Note: retrieval signal is noisy — see "Customer Needs" verbatim
              quotes for the truer story.
            </p>
          </div>
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · Chat channel · Mountain Collective · grounded in{' '}
          {formatNumber(f.engagement.engagedConversations)} real engaged chats
        </footer>
      </div>
    </div>
  )
}
