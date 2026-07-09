import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { currentMonth, getDisplayStatus } from '../utils/bills'
import MonthSelector from '../components/MonthSelector'
import BillRow from '../components/BillRow'

type Tab = 'unpaid' | 'paid' | 'all'

export default function Bills() {
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState<Tab>('unpaid')
  const navigate = useNavigate()


  const bills = useLiveQuery(
    () => db.bills.where('billingMonth').equals(month).sortBy('dueDate'),
    [month],
    []
  ) ?? []

  const unpaid = bills.filter(b => b.status !== 'paid')
  const paid = bills.filter(b => b.status === 'paid')

  const filtered = tab === 'all' ? bills : tab === 'paid' ? paid : unpaid

  // Unpaid tab: overdue pinned to top
  const sorted = tab === 'unpaid'
    ? [
        ...filtered.filter(b => getDisplayStatus(b) === 'overdue'),
        ...filtered.filter(b => getDisplayStatus(b) !== 'overdue'),
      ]
    : filtered

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <MonthSelector month={month} onChange={setMonth} />

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950 shrink-0">
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
    </div>
  )
}
