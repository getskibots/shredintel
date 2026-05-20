import { FrictionMap } from './components/FrictionMap'
import { KnowledgeGaps } from './components/KnowledgeGaps'
import { KpiStrip } from './components/KpiStrip'
import { ResolutionHero } from './components/ResolutionHero'
import {
  sampleEngagement,
  sampleFrictionPages,
  sampleKnowledgeGaps,
  sampleKpis,
  sampleResolution,
} from './fixtures/sample'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-base font-semibold tracking-tight text-slate-900">
            Analytics
            <span className="ml-2 font-normal text-slate-400">
              · Jackson Hole — ACTIVE
            </span>
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-slate-600">
              <button className="rounded-md bg-glacier-500 px-3 py-1.5 text-xs font-semibold text-white">
                Last 7 days
              </button>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Last 30 days
              </button>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Custom
              </button>
            </div>
            <button className="rounded-lg bg-glacier-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-glacier-600">
              Export chats
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <ResolutionHero
          stats={sampleResolution}
          scopeLabel="Jackson Hole Mountain Resort"
          periodLabel="Last 7 days · vs. prior 7"
          totalGreeted={sampleEngagement.totalConversations}
          engagementRate={sampleEngagement.engagementRate}
        />

        <KpiStrip tiles={sampleKpis} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <FrictionMap pages={sampleFrictionPages} />
          </div>
          <div className="lg:col-span-2">
            <KnowledgeGaps gaps={sampleKnowledgeGaps} gapRate={0.621} />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-12 pt-2 text-xs text-slate-400">
        shredintel · GSB Analytics 2.0 · concept build for Botscrew handoff
      </footer>
    </div>
  )
}

export default App
