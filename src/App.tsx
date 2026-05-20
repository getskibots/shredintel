import { DashboardShell } from './components/DashboardShell'
import { ShredIntelReportGrid } from './components/ShredIntelReportGrid'

function App() {
  return (
    <DashboardShell
      botLabel="Get Ski Tickets — ACTIVE"
      userName="Brandon Quinn"
      activeNav="analytics"
    >
      <ShredIntelReportGrid />
    </DashboardShell>
  )
}

export default App
