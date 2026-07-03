import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db'
import {
  notificationsSupported, getPermissionStatus,
  requestPermission, sendTestNotification, registerPeriodicSync,
} from '../lib/notifications'
import { requestToken, syncPush, syncPull, clearToken, getUserEmail } from '../lib/googleSync'
import type { SyncResult } from '../lib/googleSync'

const ALL_LEAD_DAYS = [0, 1, 2, 3, 5, 7, 14]
const DAY_LABEL: Record<number, string> = {
  0: 'Same day', 1: '1 day', 2: '2 days', 3: '3 days',
  5: '5 days', 7: '1 week', 14: '2 weeks',
}

export default function SettingsScreen() {
  const settings  = useLiveQuery(() => db.settings.get('app'))
  const [geminiKey,     setGeminiKey]     = useState('')
  const [keySaved,      setKeySaved]      = useState(false)
  const [permStatus,    setPermStatus]    = useState<string>(() => getPermissionStatus())
  const [testSent,      setTestSent]      = useState(false)
  const [togglingNotif, setTogglingNotif] = useState(false)

  // ── Google sync state ──────────────────────────────────────
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [syncing,        setSyncing]        = useState(false)
  const [syncResult,     setSyncResult]     = useState<SyncResult & { msg: string } | null>(null)

  useEffect(() => {
    setGeminiKey(settings?.geminiApiKey ?? '')
  }, [settings?.geminiApiKey])

  // Poll permission status — user may change it in browser settings
  useEffect(() => {
    const id = setInterval(() => setPermStatus(getPermissionStatus()), 2000)
    return () => clearInterval(id)
  }, [])

  // ── Gemini key ─────────────────────────────────────────────
  async function saveGeminiKey() {
    const trimmed = geminiKey.trim()
    await db.settings.update('app', { geminiApiKey: trimmed || undefined })
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  async function removeGeminiKey() {
    setGeminiKey('')
    await db.settings.update('app', { geminiApiKey: undefined })
  }

  // ── Display ────────────────────────────────────────────────
  async function toggleLargeFont(val: boolean) {
    await db.settings.update('app', { largeFontMode: val })
  }

  // ── Notifications ──────────────────────────────────────────
  async function toggleNotifications(enable: boolean) {
    if (togglingNotif) return
    setTogglingNotif(true)
    try {
      if (enable) {
        const result = await requestPermission()
        setPermStatus(result)
        if (result !== 'granted') return
        await db.settings.update('app', { notificationsEnabled: true })
        await registerPeriodicSync()
      } else {
        await db.settings.update('app', { notificationsEnabled: false })
      }
    } finally {
      setTogglingNotif(false)
    }
  }

  async function handleTest() {
    const ok = await sendTestNotification()
    if (ok) { setTestSent(true); setTimeout(() => setTestSent(false), 3000) }
  }

  async function toggleLeadDay(day: number) {
    const current = settings?.reminderLeadDays ?? [7, 3, 1, 0]
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => b - a)
    await db.settings.update('app', { reminderLeadDays: next })
  }

  // ── Google sync handlers ──────────────────────────────────
  async function handleSignIn() {
    if (syncing) return
    setSyncing(true); setSyncResult(null)
    try {
      const token = await requestToken()
      const email = await getUserEmail(token)
      setConnectedEmail(email)
      const r = await syncPush()
      await db.settings.update('app', { googleSync: { ...settings?.googleSync, enabled: true, lastSyncAt: new Date().toISOString() } })
      setSyncResult({
        ...r,
        msg: r.ok
          ? `Backed up ${r.pushed} bill${r.pushed !== 1 ? 's' : ''}${r.filesUploaded ? `, ${r.filesUploaded} file${r.filesUploaded !== 1 ? 's' : ''} uploaded` : ''}`
          : (r.error ?? 'Unknown error'),
      })
    } catch (err) {
      setSyncResult({ ok: false, msg: err instanceof Error ? err.message : 'Sign-in cancelled' })
    } finally { setSyncing(false) }
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true); setSyncResult(null)
    try {
      const token = await requestToken()
      const email = await getUserEmail(token)
      if (email) setConnectedEmail(email)
      const r = await syncPush()
      await db.settings.update('app', { googleSync: { ...settings?.googleSync, enabled: true, lastSyncAt: new Date().toISOString() } })
      setSyncResult({
        ...r,
        msg: r.ok
          ? `Backed up ${r.pushed} bill${r.pushed !== 1 ? 's' : ''}${r.filesUploaded ? `, ${r.filesUploaded} file${r.filesUploaded !== 1 ? 's' : ''} uploaded` : ''}`
          : (r.error ?? 'Unknown error'),
      })
    } finally { setSyncing(false) }
  }

  async function handleRestore() {
    if (syncing) return
    setSyncing(true); setSyncResult(null)
    try {
      const r = await syncPull()
      setSyncResult({
        ...r,
        msg: r.ok
          ? `Restored ${r.pulled} bill${r.pulled !== 1 ? 's' : ''} from cloud`
          : (r.error ?? 'Unknown error'),
      })
    } finally { setSyncing(false) }
  }

  async function handleDisconnect() {
    clearToken()
    setConnectedEmail(null)
    await db.settings.update('app', { googleSync: { enabled: false } })
    setSyncResult(null)
  }

  const notifEnabled = settings?.notificationsEnabled ?? false
  const leadDays     = settings?.reminderLeadDays ?? [7, 3, 1, 0]
  const isDenied     = permStatus === 'denied'
  const canToggle    = notificationsSupported() && !isDenied

  const labelCls = 'block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
      </div>

      {/* Display */}
      <Section title="Display">
        <ToggleRow
          label="Large font mode"
          description="Bigger text throughout the app"
          checked={settings?.largeFontMode ?? false}
          onChange={toggleLargeFont}
        />
      </Section>

      {/* Reminders */}
      <Section title="Reminders">
        {!notificationsSupported() ? (
          <div className="px-4 py-4">
            <p className="text-sm text-slate-500">Push notifications are not supported in this browser.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">

            {/* Enable toggle */}
            <div className="px-4 py-4 space-y-2">
              <ToggleRow
                label="Enable push notifications"
                description={
                  isDenied
                    ? 'Blocked — change in browser / system settings'
                    : notifEnabled
                      ? 'Active · fires on app open + daily background check (Android)'
                      : 'Get reminded before bills are due'
                }
                checked={notifEnabled}
                onChange={canToggle ? toggleNotifications : () => {}}
                disabled={isDenied || togglingNotif}
              />
              {isDenied && (
                <p className="text-xs text-red-400 leading-relaxed">
                  Notifications are blocked. Enable them in your browser or system settings, then come back here.
                </p>
              )}
            </div>

            {/* Lead days chips */}
            {notifEnabled && (
              <div className="px-4 py-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Notify me before due date</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_LEAD_DAYS.map(day => {
                    const active = leadDays.includes(day)
                    return (
                      <button
                        key={day}
                        onClick={() => toggleLeadDay(day)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {DAY_LABEL[day]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-600">"Same day" also covers overdue bills.</p>
              </div>
            )}

            {/* Test button */}
            {notifEnabled && (
              <div className="px-4 py-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-300">Test notification</p>
                  <p className="text-xs text-slate-500 mt-0.5">Fire a sample notification right now</p>
                </div>
                <button
                  onClick={handleTest}
                  className={`px-4 py-2.5 rounded-xl font-semibold text-sm shrink-0 transition-colors ${
                    testSent
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-200 active:bg-slate-600'
                  }`}
                >
                  {testSent ? '✓ Sent' : 'Send test'}
                </button>
              </div>
            )}

            {/* Honest note */}
            <div className="px-4 py-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-500">How it works:</strong> Notifications fire when you open the app.
                On Android Chrome, the installed PWA also registers a daily background check via Periodic Background Sync.
                iOS support is limited. Guaranteed background delivery on all platforms requires a server — this free build does not include one.
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* AI Enhancement */}
      <Section title="AI Enhancement (Optional)">
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-slate-400 leading-relaxed">
            Add your free <strong className="text-slate-300">Google Gemini API key</strong> to dramatically improve bill extraction accuracy.
            Your key is stored only on this device and never sent anywhere except Google's API.
          </p>
          <label className={labelCls}>Gemini API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={geminiKey}
              onChange={e => setGeminiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveGeminiKey()}
              placeholder="AIza…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 px-3 py-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 focus:border-blue-500 focus:outline-none text-sm font-mono"
            />
            <button
              onClick={saveGeminiKey}
              className={`px-4 py-3 rounded-xl font-semibold text-sm transition-colors shrink-0 ${
                keySaved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white active:bg-blue-700'
              }`}
            >
              {keySaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          {settings?.geminiApiKey && (
            <button onClick={removeGeminiKey} className="text-xs text-red-400 underline underline-offset-2">
              Remove key
            </button>
          )}
          <p className="text-xs text-slate-600 leading-relaxed">
            Get a free key: <span className="text-slate-500">aistudio.google.com → "Get API key"</span>
          </p>
        </div>
      </Section>

      {/* Cloud Backup */}
      <Section title="Cloud Backup (Google Drive)">
        <div className="px-4 py-4 space-y-3">
          {!connectedEmail && !settings?.googleSync.enabled ? (
            /* ── Not connected ── */
            <>
              <p className="text-sm text-slate-400 leading-relaxed">
                Back up your bills to Google Drive and restore on any device.
                Uses your free Google account — no setup needed.
              </p>
              <button
                onClick={handleSignIn}
                disabled={syncing}
                className="w-full py-3.5 rounded-xl bg-white text-slate-900 font-bold text-sm active:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2.5"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
                <span>{syncing ? 'Signing in…' : 'Sign in with Google'}</span>
              </button>
            </>
          ) : (
            /* ── Connected ── */
            <>
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xl">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">Connected to Google Drive</p>
                  {connectedEmail && (
                    <p className="text-xs text-slate-500 truncate">{connectedEmail}</p>
                  )}
                  {settings?.googleSync.lastSyncAt && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      Last backup: {format(new Date(settings.googleSync.lastSyncAt), 'MMM d · h:mm a')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50"
                >
                  {syncing ? '…' : '☁️ Back Up Now'}
                </button>
                <button
                  onClick={handleRestore}
                  disabled={syncing}
                  className="py-3 rounded-xl bg-slate-700 text-slate-200 font-semibold text-sm active:bg-slate-600 disabled:opacity-50"
                >
                  {syncing ? '…' : '⬇️ Restore'}
                </button>
              </div>

              <button
                onClick={handleDisconnect}
                className="text-xs text-red-400 underline underline-offset-2"
              >
                Disconnect Google
              </button>
            </>
          )}

          {syncResult && (
            <p className={`text-xs leading-relaxed ${syncResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {syncResult.ok ? '✓ ' : '✗ '}{syncResult.msg}
            </p>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Only sees files it created in your Drive — nothing else in your Google account is accessible.
          </p>
        </div>
      </Section>

      {/* Branding footer */}
      <div className="px-4 py-8 flex flex-col items-center gap-3">
        <img
          src="/masterlabs-logo.png"
          alt="Masterlabs"
          className="h-10 opacity-90"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          Created by <span className="text-slate-200 font-semibold">Masterlabs</span>
          {' · '}
          <a href="tel:+639479984309" className="text-slate-400">+63 947 998 4309</a>
        </p>
        <p className="text-[10px] text-slate-500">Bills Ai v2 · Your data stays on your device</p>
      </div>
      <div className="h-4" />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <div className="bg-slate-900/60 border-y border-slate-800">{children}</div>
    </div>
  )
}

function ToggleRow({
  label, description, checked, onChange, disabled = false,
}: {
  label: string; description: string; checked: boolean
  onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="w-full flex items-center justify-between py-1 active:bg-slate-800 transition-colors disabled:opacity-50"
    >
      <div className="text-left">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </div>
    </button>
  )
}
