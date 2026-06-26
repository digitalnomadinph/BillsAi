import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { db } from '../db'
import type { Bill } from '../db'
import {
  currentMonth, formatCurrency, getDisplayStatus,
  daysUntilDue, CATEGORY_META, formatMonthLabel,
} from '../utils/bills'
import MonthSelector from '../components/MonthSelector'
import BillRow from '../components/BillRow'
import MarkPaidSheet from '../components/MarkPaidSheet'

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth())
  const [markPaidBill, setMarkPaidBill] = useState<Bill | null>(null)
  const navigate = useNavigate()

  const bills = useLiveQuery(
    () => db.bills.where('billingMonth').equals(month).sortBy('dueDate'),
    [month],
    []
  ) ?? []

  const currency = 'PHP'
  const paidBills = bills.filter(b => b.status === 'paid')
  const unpaidBills = bills.filter(b => b.status !== 'paid')
  const overdueBills = unpaidBills.filter(b => getDisplayStatus(b) === 'overdue')
  const upcomingBills = unpaidBills.filter(b => getDisplayStatus(b) === 'unpaid')
  const allPaid = bills.length > 0 && paidBills.length === bills.length

  // Most urgent: overdue first (most overdue = earliest date), then soonest upcoming
  const sortedUnpaid = [
    ...overdueBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...upcomingBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  ]
  const heroBill = sortedUnpaid[0] ?? null
  const listBills = sortedUnpaid.slice(1)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <MonthSelector month={month} onChange={setMonth} />

      <div className="flex-1 overflow-y-auto">
        {/* Progress pill */}
        {bills.length > 0 && (
          <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium ${
            allPaid ? 'bg-green-950/70 text-green-400' : 'bg-slate-800/70 text-slate-400'
          }`}>
            <span>{allPaid ? '✅' : '📋'}</span>
            <span>
              {allPaid
                ? `All ${bills.length} bills paid this month!`
                : `${paidBills.length} of ${bills.length} bills paid`}
            </span>
          </div>
        )}

        {/* Hero / empty state */}
        {bills.length === 0 ? (
          <EmptyState onAdd={() => navigate('/add')} />
        ) : allPaid ? (
          <AllPaidCard month={month} />
        ) : heroBill ? (
          <HeroCard
            bill={heroBill}
            currency={currency}
            onMarkPaid={() => setMarkPaidBill(heroBill)}
            onOpen={() => navigate(`/bills/${heroBill.id}`)}
          />
        ) : null}

        {/* Remaining unpaid list */}
        {listBills.length > 0 && (
          <section className="mt-5">
            <p className="px-4 mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {overdueBills.length > 0 && upcomingBills.length > 0
                ? 'More bills'
                : overdueBills.length > 1
                  ? 'Also overdue'
                  : 'Upcoming'}
            </p>
            <div className="divide-y divide-slate-800/60">
              {listBills.map(b => <BillRow key={b.id} bill={b} />)}
            </div>
          </section>
        )}

        {/* Paid count link */}
        {paidBills.length > 0 && !allPaid && (
          <button
            onClick={() => navigate('/bills')}
            className="mx-4 mt-4 mb-2 text-xs text-slate-500 underline underline-offset-2"
          >
            View {paidBills.length} paid bill{paidBills.length !== 1 ? 's' : ''} →
          </button>
        )}

        <div className="h-4" />
      </div>

      {markPaidBill && (
        <MarkPaidSheet
          bill={markPaidBill}
          onClose={() => setMarkPaidBill(null)}
          onDone={() => setMarkPaidBill(null)}
        />
      )}
    </div>
  )
}

function HeroCard({ bill, currency, onMarkPaid, onOpen }: {
  bill: Bill; currency: string; onMarkPaid: () => void; onOpen: () => void
}) {
  const status = getDisplayStatus(bill)
  const days = daysUntilDue(bill.dueDate)
  const { icon } = CATEGORY_META[bill.category]
  const isOverdue = status === 'overdue'
  const absDays = Math.abs(days)

  const dueLine = isOverdue
    ? `${absDays} day${absDays !== 1 ? 's' : ''} overdue · ${format(parseISO(bill.dueDate), 'MMM d, yyyy')}`
    : days === 0
      ? `Due today · ${format(parseISO(bill.dueDate), 'MMM d, yyyy')}`
      : `Due in ${days} day${days !== 1 ? 's' : ''} · ${format(parseISO(bill.dueDate), 'MMM d, yyyy')}`

  return (
    <div className={`mx-4 mt-3 rounded-2xl p-5 ${
      isOverdue
        ? 'bg-red-950/50 border border-red-800/40'
        : 'bg-blue-950/50 border border-blue-800/30'
    }`}>
      <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isOverdue ? 'text-red-400' : 'text-blue-400'}`}>
        {isOverdue ? '⚠️ Overdue' : 'Next Bill Due'}
      </p>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{icon}</span>
          <span className="text-xl font-bold text-slate-100">{bill.biller}</span>
        </div>
        <span className="text-xl font-bold tabular-nums text-slate-100 shrink-0">
          {formatCurrency(bill.amount, bill.currency ?? currency)}
        </span>
      </div>
      <p className={`text-sm mb-4 ${isOverdue ? 'text-red-300' : 'text-slate-400'}`}>{dueLine}</p>
      <button
        onClick={onMarkPaid}
        className={`w-full py-3.5 rounded-xl font-bold text-white transition-colors active:scale-[0.98] ${
          isOverdue ? 'bg-red-600 active:bg-red-700' : 'bg-blue-600 active:bg-blue-700'
        }`}
      >
        Mark as Paid ✓
      </button>
      <button
        onClick={onOpen}
        className="mt-2 w-full text-center text-xs text-slate-500 underline underline-offset-2 py-1"
      >
        View details →
      </button>
    </div>
  )
}

function AllPaidCard({ month }: { month: string }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl p-6 bg-green-950/50 border border-green-800/30 flex flex-col items-center text-center gap-2">
      <span className="text-5xl">🎉</span>
      <h2 className="text-lg font-bold text-green-400">All paid!</h2>
      <p className="text-sm text-slate-400">Every bill for {formatMonthLabel(month)} is settled.</p>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl p-6 bg-slate-800/40 border border-slate-700/40 flex flex-col items-center text-center gap-3">
      <span className="text-5xl">📭</span>
      <h2 className="text-lg font-semibold text-slate-300">No bills this month</h2>
      <p className="text-sm text-slate-500">Tap <strong>+</strong> below to add your first bill.</p>
      <button
        onClick={onAdd}
        className="mt-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700"
      >
        Add a Bill
      </button>
    </div>
  )
}
