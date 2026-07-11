import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { currentMonth, getDisplayStatus, formatMonthLabel } from '../utils/bills'
import MonthSelector from '../components/MonthSelector'
import BillRow from '../components/BillRow'

type Tab = 'unpaid' | 'paid' | 'all'

export default function Bills() {
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState<Tab>('unpaid')
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const bills = useLiveQuery(
    () => db.bills.where('billingMonth').equals(month).sortBy('dueDate'),
    [month],
    []
  ) ?? []

  const unpaid = bills.filter(b => b.status !== 'paid')
  const paid = bills.filter(b => b.status === 'paid')
  const filtered = tab === 'all' ? bills : tab === 'paid' ? paid : unpaid

  const sorted = tab === 'unpaid'
    ? [
        ...filtered.filter(b => getDisplayStatus(b) === 'overdue'),
        ...filtered.filter(b => getDisplayStatus(b) !== 'overdue'),
      ]
    : filtered

  async function handleDeleteAll() {
    if (deleting) return
    setDeleting(true)
    try {
      const ids = bills.map(b => b.id)
      await db.bills.bulkDelete(ids)
      setShowDeleteAll(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <MonthSelector month={month} onChange={m => { setMonth(m); setShowDeleteAll(false) }} />

      {/* Tabs + delete-all button */}
      <div className="flex items-center border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex flex-1">
          {(['unpaid', 'paid', 'all'] as Tab[]).map(t => {
            const count = t === 'unpaid' ? unpaid.length : t === 'paid' ? paid.length : bills.length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-semibold capitalize relative transition-colors ${
                  tab === t ? 'text-blue-400' : 'text-slate-500'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
                {tab === t && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500 rounded-t" />}
              </button>
            )
          })}
        </div>

        {bills.length > 0 && (
          <button
            onClick={() => setShowDeleteAll(true)}
            className="px-3 py-3 text-slate-600 active:text-red-400 transition-colors shrink-0"
            aria-label="Delete all bills this month"
          >
            🗑
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <span className="text-5xl">{tab === 'paid' ? '📭' : '🎉'}</span>
            <p className="text-slate-300 font-semibold">
              {tab === 'paid' ? 'No paid bills' : tab === 'unpaid' ? 'No unpaid bills' : 'No bills'} this month
            </p>
            {tab !== 'paid' && (
              <button
                onClick={() => navigate('/add')}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm active:bg-blue-700"
              >
                Add a Bill
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {sorted.map(b => <BillRow key={b.id} bill={b} />)}
          </div>
        )}
        <div className="h-4" />
      </div>

      {/* Delete all sheet */}
      {showDeleteAll && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[100]" onClick={() => setShowDeleteAll(false)}>
          <div
            className="w-full sm:max-w-md bg-slate-900 border border-slate-700/60 rounded-t-2xl px-5 pt-5 pb-safe flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🗑</span>
              <div>
                <h3 className="text-base font-bold text-slate-100">Delete all {formatMonthLabel(month)} bills?</h3>
                <p className="text-sm text-slate-400 mt-1">
                  This will delete all <strong className="text-slate-200">{bills.length} bill{bills.length !== 1 ? 's' : ''}</strong> for this month — both paid and unpaid. This cannot be undone.
                </p>
              </div>
            </div>
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="w-full py-4 bg-red-600 text-white rounded-xl font-bold active:bg-red-700 disabled:opacity-50 mt-1"
            >
              {deleting ? 'Deleting…' : `Delete all ${bills.length} bills`}
            </button>
            <button
              onClick={() => setShowDeleteAll(false)}
              className="w-full py-3.5 bg-slate-800 text-slate-200 rounded-xl font-semibold active:bg-slate-700 mb-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
