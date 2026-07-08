import { HashRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { AhhhFaqItTool } from './components/AhhhFaqItTool'
import { BotAnalyticsPage } from './components/BotAnalyticsPage'
import { BotIndexPage } from './components/BotIndexPage'
import { DashboardShell } from './components/DashboardShell'
import { PasswordGate } from './components/PasswordGate'
import { VoiceReportGrid } from './components/VoiceReportGrid'
import { VoiceAnalyticsPage } from './components/VoiceAnalyticsPage/VoiceAnalyticsPage'
import { isEmbedMode, useEmbedHeightSync } from './lib/embed'
import { useBotChannel } from './data/useAnalytics'
import { omniGroupByKey, routeForChannel } from './lib/omniGroups'

/**
 * /omni/:key — enter an omni group (prototype). Redirects to the group's default
 * (first) channel route, carrying ?omni={key} so the channel toggle renders. Lets
 * us feel the omni Chat/Voice toggle now, using two real bot_ids behind one entity.
 */
function OmniEntry() {
  const { key } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const group = omniGroupByKey(key)
  if (!group || group.channels.length === 0) return <Navigate to="/" replace />
  const sp = new URLSearchParams(params)
  sp.set('omni', group.key)
  return <Navigate to={`${routeForChannel(group.channels[0])}?${sp.toString()}`} replace />
}

/**
 * /bot/:botId dispatcher — renders the channel-appropriate card. Voice bots get
 * VoiceAnalyticsPage, chat bots get BotAnalyticsPage. This is what makes the
 * Botscrew embed (which always opens /bot/{id}) auto-cover voice bots with no
 * loader change.
 */
function BotRoute() {
  const { botId } = useParams<{ botId: string }>()
  const { channel, isLoading } = useBotChannel(Number(botId))
  if (isLoading) {
    return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>
  }
  return channel === 'voice' ? <VoiceAnalyticsPage /> : <BotAnalyticsPage />
}

function ChannelShell() {
  const location = useLocation()
  const channel = location.pathname.startsWith('/voice') ? 'voice' : 'chat'
  // In embed mode, sync body height to the parent iframe every layout tick
  useEmbedHeightSync(isEmbedMode())
  // Bot/resort label switches based on which chat dashboard is active
  const botLabel = location.pathname.startsWith('/chat/mc')
    ? 'Mountain Collective — Chat'
    : location.pathname.startsWith('/voice')
      ? 'Mountain Collective — Voice'
      : 'Jackson Hole — Chat'

  // Ahhh FAQ It is its own standalone surface — no dashboard chrome.
  if (location.pathname === '/tools/ahhh-faq-it') return <AhhhFaqItTool />

  return (
    <DashboardShell
      botLabel={botLabel}
      userName="Brandon Quinn"
      activeChannel={channel}
    >
      <Routes>
        {/* Root = a searchable directory of ALL available bots.
            All chat routes collapse into one canonical layout — BotAnalyticsPage.
            Voice stays separate because its data model differs (no page URLs,
            call summaries live in raw.admin_call). */}
        <Route path="/" element={<BotIndexPage />} />
        <Route path="/chat" element={<Navigate to="/" replace />} />
        <Route path="/chat/jh" element={<Navigate to="/bot/43" replace />} />
        <Route path="/chat/mc" element={<Navigate to="/bot/2" replace />} />
        <Route path="/voice" element={<VoiceReportGrid />} />
        <Route path="/voice/:botId" element={<VoiceAnalyticsPage />} />
        <Route path="/bot/:botId" element={<BotRoute />} />
        {/* Omni-channel prototype — enter a group, land on its default channel + toggle */}
        <Route path="/omni/:key" element={<OmniEntry />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardShell>
  )
}

// faq.getskibots.com is the Ahhh FAQ It tool's own front door: the app detects
// the `faq.` hostname and serves the tool as the homepage (no dashboard chrome,
// no router). analytics.getskibots.com (and everything else) stays ShredIntel;
// the tool is still reachable there at /#/tools/ahhh-faq-it.
const isFaqHost = () =>
  typeof window !== 'undefined' && /^faq\./i.test(window.location.hostname)

function App() {
  if (isFaqHost()) {
    return (
      <PasswordGate>
        <AhhhFaqItTool />
      </PasswordGate>
    )
  }
  return (
    <PasswordGate>
      <HashRouter>
        <ChannelShell />
      </HashRouter>
    </PasswordGate>
  )
}

export default App
