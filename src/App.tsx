import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BotAnalyticsPage } from './components/BotAnalyticsPage'
import { DashboardShell } from './components/DashboardShell'
import { VoiceReportGrid } from './components/VoiceReportGrid'

function ChannelShell() {
  const location = useLocation()
  const channel = location.pathname.startsWith('/voice') ? 'voice' : 'chat'
  // Bot/resort label switches based on which chat dashboard is active
  const botLabel = location.pathname.startsWith('/chat/mc')
    ? 'Mountain Collective — Chat'
    : location.pathname.startsWith('/voice')
      ? 'Mountain Collective — Voice'
      : 'Jackson Hole — Chat'

  return (
    <DashboardShell
      botLabel={botLabel}
      userName="Brandon Quinn"
      activeChannel={channel}
    >
      <Routes>
        {/* All chat routes collapse into one canonical layout — BotAnalyticsPage.
            Voice stays separate because its data model differs (no page URLs,
            call summaries live in raw.admin_call). */}
        <Route path="/" element={<Navigate to="/bot/43" replace />} />
        <Route path="/chat" element={<Navigate to="/bot/43" replace />} />
        <Route path="/chat/jh" element={<Navigate to="/bot/43" replace />} />
        <Route path="/chat/mc" element={<Navigate to="/bot/2" replace />} />
        <Route path="/voice" element={<VoiceReportGrid />} />
        <Route path="/bot/:botId" element={<BotAnalyticsPage />} />
        <Route path="*" element={<Navigate to="/bot/43" replace />} />
      </Routes>
    </DashboardShell>
  )
}

function App() {
  return (
    <HashRouter>
      <ChannelShell />
    </HashRouter>
  )
}

export default App
