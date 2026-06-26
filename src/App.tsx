import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { initSettings } from './db'
import { useNotificationCheck } from './hooks/useNotificationCheck'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Bills from './screens/Bills'
import Add from './screens/Add'
import Reports from './screens/Reports'
import SettingsScreen from './screens/SettingsScreen'
import BillDetail from './screens/BillDetail'

export default function App() {
  useEffect(() => { initSettings() }, [])
  useNotificationCheck()

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-svh bg-slate-950">
        <main className="flex-1 flex flex-col pb-16">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/bills/:id" element={<BillDetail />} />
            <Route path="/add" element={<Add />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
