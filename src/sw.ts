/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Take over immediately when a new version is deployed
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

// ─── Periodic Background Sync ─────────────────────────────────

self.addEventListener('periodicsync' as 'activate', (event) => {
  const e = event as unknown as { tag: string; waitUntil: (p: Promise<unknown>) => void }
  if (e.tag === 'bill-reminders') {
    e.waitUntil(runBillCheck())
  }
})

// ─── Notification click → open app ───────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const billId = (event.notification.data as Record<string, string> | null)?.billId
  const url = billId ? `/bills/${billId}` : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return (client as WindowClient).focus()
      }
      return self.clients.openWindow(url)
    })
  )
})

// ─── IndexedDB helpers (raw API — Dexie unavailable in SW) ────

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('BillsAiDB')
    req.onsuccess = () => resolve(req.result)
    req.onerror  = () => reject(req.error)
  })
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror   = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror   = () => reject(req.error)
  })
}

// ─── Bill check ───────────────────────────────────────────────

interface BillRow {
  id: string; biller: string; amount: number; dueDate: string; status: string
}
interface SettingsRow {
  reminderLeadDays: number[]; notificationsEnabled?: boolean
}

async function runBillCheck() {
  try {
    const db       = await idbOpen()
    const settings = await idbGet<SettingsRow>(db, 'settings', 'app')
    if (!settings?.notificationsEnabled) return

    const bills    = await idbGetAll<BillRow>(db, 'bills')
    const today    = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)
    const leadDays = settings.reminderLeadDays ?? [7, 3, 1, 0]
    const dedup    = await caches.open('bill-notif-dedup')

    for (const bill of bills) {
      if (bill.status === 'paid') continue
      const due  = new Date(bill.dueDate + 'T00:00:00')
      const days = Math.round((due.getTime() - today.getTime()) / 86400000)
      if (!leadDays.includes(days) && !(days < 0 && leadDays.includes(0))) continue

      const key = `notif-${bill.id}-${days}-${todayStr}`
      if (await dedup.match(new Request(key))) continue

      const title =
        days < 0  ? `⚠️ Overdue: ${bill.biller}` :
        days === 0 ? `🔔 Due Today: ${bill.biller}` :
                     `📅 Due in ${days} day${days !== 1 ? 's' : ''}: ${bill.biller}`

      await self.registration.showNotification(title, {
        body: `₱${bill.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — tap to view`,
        icon: '/icons/icon-192.png',
        tag:  `bill-${bill.id}`,
        data: { billId: bill.id },
      })
      await dedup.put(new Request(key), new Response('1'))
    }
  } catch (err) {
    console.error('[sw] bill check failed:', err)
  }
}
