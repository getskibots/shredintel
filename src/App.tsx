import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DashboardShell } from './components/DashboardShell'
import { ShredIntelReportGrid } from './components/ShredIntelReportGrid'
import { VoiceReportGrid } from './components/VoiceReportGrid'

function ChannelShell() {
  const location = useLocation()
  const channel = location.pathname.startsWith('/voice') ? 'voice' : 'chat'

  return (
    <DashboardShell
      botLabel="Get Ski Tickets — ACTIVE"
      userName="Brandon Quinn"
      activeChannel={channel}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ShredIntelReportGrid />} />
        <Route path="/voice" element={<VoiceReportGrid />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
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
