import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { checkAndNotify, registerPeriodicSync, getPermissionStatus } from '../lib/notifications'

export function useNotificationCheck() {
  const bills    = useLiveQuery(() => db.bills.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('app'), [])

  useEffect(() => {
    if (!bills || !settings?.notificationsEnabled) return
    checkAndNotify(bills, settings.reminderLeadDays ?? [7, 3, 1, 0])
    if (getPermissionStatus() === 'granted') {
      registerPeriodicSync()
    }
  }, [bills, settings])
}
