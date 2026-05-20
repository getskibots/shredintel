import { Placeholder } from '../Placeholder'
import { SectionHeader } from '../SectionHeader'
import { SectionNav } from '../SectionNav'

const sections = [
  { id: 'call-core', number: '1', name: 'Call Core' },
  { id: 'conversation-intelligence', number: '2', name: 'Conversation Intelligence' },
  { id: 'caller-identity', number: '3', name: 'Caller Identity' },
  { id: 'behavioral-context', number: '4', name: 'Behavioral Context' },
]

export function VoiceReportGrid() {
  return (
    <div>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Voice
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Call-channel analytics — concept, awaiting voice export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-slate-400">
              <button className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium">
                Last 7 days
              </button>
              <button className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium">
                Last 30 days
              </button>
              <button className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium">
                Last 90 days
              </button>
              <button className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium">
                Custom
              </button>
            </div>
            <button
              disabled
              className="cursor-not-allowed rounded-lg bg-slate-300 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Export calls
            </button>
          </div>
        </div>
        <SectionNav items={sections} />
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-6 py-8">
        {/* Banner */}
        <div className="rounded-3xl border border-dashed border-botscrew-400 bg-botscrew-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-botscrew-500">
                Concept · pending data
              </div>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                Voice analytics, designed but not yet wired
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                You have ~6 months of voice data. Drop the export and these
                reports will be grounded in real shapes — same playbook we used
                for chat.
              </p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
              <div className="font-semibold text-slate-700">Next step</div>
              <div>Share the voice CSV/JSON path.</div>
            </div>
          </div>
        </div>

        {/* ── § 1 Call Core ──────────────────────────────────────────── */}
        <section id="call-core" className="scroll-mt-40 space-y-5">
          <SectionHeader number="1" name="Call Core" tagline="What happened on the line?" />
          <Placeholder
            title="Call resolution + duration overview"
            description="Hero metric: first-call resolution rate. Engagement equivalent: did the caller reach intent? Average handle time + median duration. Daily trend with delta vs prior period."
            source="call_id · outcome · duration_seconds · started_at · ended_at"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Placeholder
              title="Hangup reason breakdown"
              description="Why calls ended — natural completion, caller hangup, transfer, voicemail, timeout. The hangup pattern tells you where the bot is losing people."
              source="end_reason · transfer_to · was_voicemail"
            />
            <Placeholder
              title="First-call resolution"
              description="Share of calls resolved without callback within 24h. Catches the bot-resolved cases that should have escalated but didn't."
              source="call_id · caller_id (recurring) · outcome"
            />
          </div>
        </section>

        {/* ── § 2 Conversation Intelligence ──────────────────────────── */}
        <section id="conversation-intelligence" className="scroll-mt-40 space-y-5">
          <SectionHeader
            number="2"
            name="Conversation Intelligence"
            tagline="What was said, and how?"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Placeholder
              title="Sentiment timeline"
              description="Caller sentiment over the call (opening / mid / closing). Surfaces calls that started angry and ended calm — or vice versa."
              source="transcript_segments · sentiment_score · timestamp"
            />
            <Placeholder
              title="Top intents / call reasons"
              description="Clustered topics — pass changes, refunds, lift status, parking. The Voice analog of chat’s knowledge gaps."
              source="transcript · intent · category"
            />
          </div>
          <Placeholder
            title="Knowledge-gap moments"
            description="Where the bot stalled, asked the caller to repeat, or escalated. Maps to the chat knowledge-gap panel — the questions to add to the KB."
            source="agent_actions · fallback_count · transferred"
          />
        </section>

        {/* ── § 3 Caller Identity ────────────────────────────────────── */}
        <section id="caller-identity" className="scroll-mt-40 space-y-5">
          <SectionHeader number="3" name="Caller Identity" tagline="Who's calling?" />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Placeholder
              title="Known vs anonymous callers"
              description="Calls where the number maps to a known guest record vs unknown. Aggregate only — phone numbers are not displayed."
              source="caller_id_hash · matched_contact · area_code"
            />
            <Placeholder
              title="Returning caller rate"
              description="Share of calls from numbers that called before. High rate = recurring issues. Low rate = first-touch volume."
              source="caller_id_hash (recurring)"
            />
          </div>
        </section>

        {/* ── § 4 Behavioral Context ─────────────────────────────────── */}
        <section id="behavioral-context" className="scroll-mt-40 space-y-5">
          <SectionHeader number="4" name="Behavioral Context" tagline="Where, when, how?" />
          <Placeholder
            title="Call demand heatmap"
            description="Time-of-day × day-of-week call volume, with after-hours coverage callout. Same shape as the chat heatmap."
            source="started_at · timezone"
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Placeholder
              title="Geography & area code"
              description="Caller origin by area code, surfaced as a state/region map. Where your inbound demand is coming from."
              source="area_code · caller_state"
            />
            <Placeholder
              title="Phone vs SIP origin"
              description="Mobile / landline / SIP split. Affects audio quality + drop-off rates."
              source="caller_channel · audio_codec"
            />
          </div>
        </section>

        <footer className="pt-2 text-xs text-slate-400">
          shredintel · Voice channel · concept build pending data export
        </footer>
      </div>
    </div>
  )
}
