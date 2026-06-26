import type { Bill } from '../db'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  return Notification.requestPermission()
}

export async function sendTestNotification(): Promise<boolean> {
  if (Notification.permission !== 'granted') return false
  new Notification('Bills Ai 🔔', {
    body: "Notifications are working! You'll be reminded before bills are due.",
    icon: '/icons/icon-192.png',
  })
  return true
}

export async function registerPeriodicSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    if (!('periodicSync' in reg)) return false
    await (reg as any).periodicSync.register('bill-reminders', {
      minInterval: 24 * 60 * 60 * 1000,
    })
    return true
  } catch {
    return false
  }
}

function dedupKey(billId: string, daysUntil: number): string {
  const today = new Date().toISOString().slice(0, 10)
  return `notif-${billId}-${daysUntil}-${today}`
}

export function checkAndNotify(bills: Bill[], leadDays: number[]) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const bill of bills) {
    if (bill.status === 'paid') continue
    const due = new Date(bill.dueDate + 'T00:00:00')
    const days = Math.round((due.getTime() - today.getTime()) / 86400000)

    // Match exact lead-day hits; treat all overdue as "day 0" if 0 is in the list
    const matches = leadDays.includes(days) || (days < 0 && leadDays.includes(0))
    if (!matches) continue

    const key = dedupKey(bill.id, days)
    if (localStorage.getItem(key)) continue
    localStorage.setItem(key, '1')

    const title =
      days < 0  ? `⚠️ Overdue: ${bill.biller}` :
      days === 0 ? `🔔 Due Today: ${bill.biller}` :
                   `📅 Due in ${days} day${days !== 1 ? 's' : ''}: ${bill.biller}`

    new Notification(title, {
      body: `₱${bill.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} — tap to view`,
      icon: '/icons/icon-192.png',
      tag: `bill-${bill.id}`,
    })
  }
}
