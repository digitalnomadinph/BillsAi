import { db } from '../db'
import type { Bill } from '../db'

export async function ensureRecurringBills(month: string): Promise<void> {
  const allRecurring = await db.bills.filter(b => b.isRecurring).toArray()
  if (!allRecurring.length) return

  // Build template map: biller|day → most-recently-created instance
  const templates = new Map<string, Bill & { recurrenceDay: number }>()
  const seriesFirstMonth = new Map<string, string>()

  for (const bill of allRecurring) {
    const day = bill.recurrenceDay ?? parseInt(bill.dueDate.slice(8, 10), 10)
    const key = `${bill.biller}|${day}`

    const cur = templates.get(key)
    if (!cur || bill.createdAt > cur.createdAt) {
      templates.set(key, { ...bill, recurrenceDay: day })
    }

    const first = seriesFirstMonth.get(key)
    if (!first || bill.billingMonth < first) {
      seriesFirstMonth.set(key, bill.billingMonth)
    }
  }

  // What's already in the target month?
  const existingThisMonth = await db.bills.where('billingMonth').equals(month).toArray()
  const existingKeys = new Set(
    existingThisMonth
      .filter(b => b.isRecurring)
      .map(b => `${b.biller}|${b.recurrenceDay ?? parseInt(b.dueDate.slice(8, 10), 10)}`)
  )

  const [year, mon] = month.split('-').map(Number)
  const maxDay = new Date(year, mon, 0).getDate()
  const now = new Date().toISOString()

  for (const [key, template] of templates) {
    if (existingKeys.has(key)) continue

    // Don't generate before the series first appeared
    const firstMonth = seriesFirstMonth.get(key) ?? month
    if (month < firstMonth) continue

    const clampedDay = Math.min(template.recurrenceDay, maxDay)
    const dueDate = `${month}-${String(clampedDay).padStart(2, '0')}`

    await db.bills.add({
      id: crypto.randomUUID(),
      biller: template.biller,
      category: template.category,
      amount: 0,
      currency: template.currency,
      dueDate,
      billingMonth: month,
      status: 'unpaid',
      isRecurring: true,
      recurrenceDay: template.recurrenceDay,
      notes: template.notes,
      createdAt: now,
      updatedAt: now,
    })
  }
}
