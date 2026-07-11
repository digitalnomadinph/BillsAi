import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { db } from '../db'
import type { Bill } from '../db'
import { getDisplayStatus, daysUntilDue, formatCurrency, CATEGORY_META } from '../utils/bills'
import StatusBadge from './StatusBadge'

export default function BillRow({ bill }: { bill: Bill }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const status = getDisplayStatus(bill)
  const days = daysUntilDue(bill.dueDate)
  const { icon } = CATEGORY_META[bill.category]

  if (confirming) {
    return (
      <div className="flex items-center gap-2 px-4 py-3.5 bg-red-950/50 border-l-4 border-red-500">
        <span className="flex-1 text-sm text-red-300 truncate">Delete "{bill.biller}"?</span>
        <button
          onClick={() => db.bills.delete(bill.id)}
          className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg active:bg-red-700 shrink-0"
        >
          Delete
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg active:bg-slate-600 shrink-0"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center ${
      status === 'overdue' ? 'border-l-4 border-red-500' : 'border-l-4 border-transparent'
    }`}>
      <button
        onClick={() => navigate(`/bills/${bill.id}`)}
        className="flex-1 flex items-center gap-3 py-4 pl-3 pr-2 text-left active:bg-slate-800/60 transition-colors min-w-0"
      >
        <span className="text-2xl w-8 text-center shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-semibold truncate ${status === 'overdue' ? 'text-red-300' : 'text-slate-100'}`}>
              {bill.biller}
            </span>
            {bill.amount === 0 && bill.isRecurring && status !== 'paid' ? (
              <span className="text-xs font-semibold text-amber-400 shrink-0">Set amount →</span>
            ) : (
              <span className={`font-bold tabular-nums shrink-0 text-sm ${
                status === 'paid' ? 'text-green-400' : status === 'overdue' ? 'text-red-400' : 'text-slate-100'
              }`}>
                {formatCurrency(bill.amount, bill.currency)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-xs text-slate-500">
              Due {format(parseISO(bill.dueDate), 'MMM d, yyyy')}
            </span>
            <StatusBadge status={status} daysUntil={days} />
          </div>
        </div>
      </button>

      <button
        onClick={() => setConfirming(true)}
        className="px-3 py-4 text-slate-600 active:text-red-400 transition-colors shrink-0"
        aria-label={`Delete ${bill.biller}`}
      >
        🗑
      </button>
    </div>
  )
}
