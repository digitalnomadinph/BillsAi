import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { Bill } from '../db'
import { getDisplayStatus, daysUntilDue, formatCurrency, CATEGORY_META } from '../utils/bills'
import StatusBadge from './StatusBadge'

export default function BillRow({ bill }: { bill: Bill }) {
  const navigate = useNavigate()
  const status = getDisplayStatus(bill)
  const days = daysUntilDue(bill.dueDate)
  const { icon } = CATEGORY_META[bill.category]

  return (
    <button
      onClick={() => navigate(`/bills/${bill.id}`)}
      className={`w-full flex items-center gap-3 py-4 text-left transition-colors active:bg-slate-800/60 ${
        status === 'overdue' ? 'pl-3 pr-4 border-l-4 border-red-500' : 'px-4 border-l-4 border-transparent'
      }`}
    >
      <span className="text-2xl w-8 text-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-semibold truncate ${status === 'overdue' ? 'text-red-300' : 'text-slate-100'}`}>
            {bill.biller}
          </span>
          <span className={`font-bold tabular-nums shrink-0 text-sm ${
            status === 'paid' ? 'text-green-400' : status === 'overdue' ? 'text-red-400' : 'text-slate-100'
          }`}>
            {formatCurrency(bill.amount, bill.currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs text-slate-500">
            Due {format(parseISO(bill.dueDate), 'MMM d, yyyy')}
          </span>
          <StatusBadge status={status} daysUntil={days} />
        </div>
      </div>
    </button>
  )
}
