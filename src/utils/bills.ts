import { format, parseISO, isBefore, startOfDay, differenceInDays } from 'date-fns'
import type { Bill, BillCategory } from '../db'

export function getDisplayStatus(bill: Bill): 'paid' | 'overdue' | 'unpaid' {
  if (bill.status === 'paid') return 'paid'
  if (isBefore(parseISO(bill.dueDate), startOfDay(new Date()))) return 'overdue'
  return 'unpaid'
}

export function daysUntilDue(dueDate: string): number {
  return differenceInDays(parseISO(dueDate), startOfDay(new Date()))
}

export function getBillingMonth(dueDate: string): string {
  return format(parseISO(dueDate), 'yyyy-MM')
}

export function currentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

export function formatMonthLabel(yyyyMM: string): string {
  return format(parseISO(yyyyMM + '-01'), 'MMMM yyyy')
}

export function shiftMonth(yyyyMM: string, delta: number): string {
  const d = parseISO(yyyyMM + '-01')
  d.setMonth(d.getMonth() + delta)
  return format(d, 'yyyy-MM')
}

export function formatCurrency(amount: number, currency = 'PHP'): string {
  if (currency === 'PHP') {
    return '₱ ' + amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}

export const CATEGORY_META: Record<BillCategory, { label: string; icon: string }> = {
  utility:      { label: 'Utility',      icon: '⚡' },
  internet:     { label: 'Internet',     icon: '🌐' },
  mobile:       { label: 'Mobile',       icon: '📱' },
  rent:         { label: 'Rent',         icon: '🏠' },
  subscription: { label: 'Subscription', icon: '📺' },
  loan:         { label: 'Loan',         icon: '💰' },
  insurance:    { label: 'Insurance',    icon: '🛡️' },
  tuition:      { label: 'Tuition',      icon: '🎓' },
  credit_card:  { label: 'Credit Card',  icon: '💳' },
  other:        { label: 'Other',        icon: '📄' },
}

export const COMMON_BILLERS: { name: string; category: BillCategory }[] = [
  { name: 'Meralco',                    category: 'utility' },
  { name: 'Maynilad',                   category: 'utility' },
  { name: 'Manila Water',               category: 'utility' },
  { name: 'PLDT',                       category: 'internet' },
  { name: 'Globe Broadband',            category: 'internet' },
  { name: 'Converge',                   category: 'internet' },
  { name: 'Sky Broadband',              category: 'internet' },
  { name: 'Globe Postpaid',             category: 'mobile' },
  { name: 'Smart Postpaid',             category: 'mobile' },
  { name: 'DITO Postpaid',              category: 'mobile' },
  { name: 'Cignal',                     category: 'subscription' },
  { name: 'Netflix',                    category: 'subscription' },
  { name: 'Spotify',                    category: 'subscription' },
  { name: 'YouTube Premium',            category: 'subscription' },
  { name: 'Disney+',                    category: 'subscription' },
  { name: 'BDO Credit Card',            category: 'credit_card' },
  { name: 'BPI Credit Card',            category: 'credit_card' },
  { name: 'Metrobank Credit Card',      category: 'credit_card' },
  { name: 'Security Bank Credit Card',  category: 'credit_card' },
  { name: 'Pag-IBIG Fund',             category: 'loan' },
  { name: 'Housing Loan',               category: 'loan' },
  { name: 'Car Loan',                   category: 'loan' },
  { name: 'SSS',                        category: 'insurance' },
  { name: 'PhilHealth',                 category: 'insurance' },
  { name: 'Rent',                       category: 'rent' },
  { name: 'Tuition',                    category: 'tuition' },
]
