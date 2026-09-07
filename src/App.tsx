import { useEffect, useState } from 'react'
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
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      // Check if a new SW is already waiting
      if (reg.waiting) { setUpdateReady(true); return }
      // Listen for a new SW installing then moving to waiting
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        newSW?.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateReady(true)
          }
        })
      })
    })
    // Poll for updates every 60 s (catches deploys while app is open)
    const id = setInterval(() => navigator.serviceWorker.ready.then(r => r.update()), 60_000)
    return () => clearInterval(id)
  }, [])

  function applyUpdate() {
    navigator.serviceWorker.ready.then(reg => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
    window.location.reload()
  }

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-svh bg-slate-950">
        {/* Masterlabs branding bar — shown on every page */}
        <header className="fixed top-0 inset-x-0 z-40 h-9 bg-slate-900/95 backdrop-blur border-b border-slate-800/60 flex items-center justify-center shrink-0">
          <img src="/masterlabs-logo.png" alt="Masterlabs" className="h-5 object-contain" />
        </header>

        {/* Update banner */}
        {updateReady && (
          <div className="fixed top-9 inset-x-0 z-50 flex items-center justify-between gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium shadow-lg">
            <span>🆕 New version available</span>
            <button onClick={applyUpdate} className="px-3 py-1 bg-white text-blue-700 rounded-lg text-xs font-bold active:bg-blue-50 shrink-0">
              Update now
            </button>
          </div>
        )}

        <main className="flex-1 flex flex-col pb-shell pt-9">
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
