import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DashboardShell } from './components/DashboardShell'
import { MCChatReportGrid } from './components/MCChatReportGrid'
import { ShredIntelReportGrid } from './components/ShredIntelReportGrid'
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
        <Route path="/" element={<Navigate to="/chat/jh" replace />} />
        <Route path="/chat" element={<Navigate to="/chat/jh" replace />} />
        <Route path="/chat/jh" element={<ShredIntelReportGrid />} />
        <Route path="/chat/mc" element={<MCChatReportGrid />} />
        <Route path="/voice" element={<VoiceReportGrid />} />
        <Route path="*" element={<Navigate to="/chat/jh" replace />} />
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
