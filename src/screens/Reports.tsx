import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { db } from '../db'
import type { Bill, BillCategory } from '../db'
import {
  currentMonth, shiftMonth, formatMonthLabel, formatCurrency, CATEGORY_META,
} from '../utils/bills'

// ─── Range ────────────────────────────────────────────────────

type Range = 'month' | '3m' | '6m' | 'year'

const RANGE_OPTS: { id: Range; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '3m',    label: '3 months'  },
  { id: '6m',    label: '6 months'  },
  { id: 'year',  label: 'This year' },
]

function getMonths(range: Range): string[] {
  const now = currentMonth()
  switch (range) {
    case 'month': return [now]
    case '3m':    return [shiftMonth(now, -2), shiftMonth(now, -1), now]
    case '6m':    return Array.from({ length: 6 }, (_, i) => shiftMonth(now, i - 5))
    case 'year': {
      const yr = now.slice(0, 4)
      return Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`)
    }
  }
}

// ─── Colors ───────────────────────────────────────────────────

const CAT_COLOR: Record<BillCategory, string> = {
  utility:      '#3b82f6',
  internet:     '#06b6d4',
  mobile:       '#8b5cf6',
  rent:         '#f59e0b',
  subscription: '#10b981',
  loan:         '#ef4444',
  insurance:    '#6366f1',
  tuition:      '#f97316',
  credit_card:  '#ec4899',
  other:        '#94a3b8',
}

// ─── CSV export ───────────────────────────────────────────────

function exportCSV(bills: Bill[], rangeLabel: string) {
  const headers = ['Biller', 'Category', 'Amount Due', 'Amount Paid', 'Due Date', 'Paid Date', 'Status']
  const rows = bills.map(b => [
    b.biller,
    CATEGORY_META[b.category].label,
    b.amount.toFixed(2),
    b.paidAmount?.toFixed(2) ?? '',
    b.dueDate,
    b.paidDate ?? '',
    b.status,
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `bills-${rangeLabel}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Tooltip styles ───────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      <p className="text-slate-100 font-semibold">
        ₱{payload[0].value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
      </p>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────

export default function Reports() {
  const [range, setRange] = useState<Range>('month')

  const months = useMemo(() => getMonths(range), [range])

  const allBills = useLiveQuery(
    () => db.bills.where('billingMonth').anyOf(months).toArray(),
    [months.join(',')],
    []
  ) ?? []

  const paidBills = useMemo(() => allBills.filter(b => b.status === 'paid'), [allBills])

  // Monthly totals (paid only)
  const monthlyData = useMemo(() =>
    months.map(m => ({
      month: m,
      label: format(parseISO(m + '-01'), months.length > 6 ? 'MMM' : 'MMM yy'),
      total: paidBills
        .filter(b => b.billingMonth === m)
        .reduce((s, b) => s + (b.paidAmount ?? b.amount), 0),
    })),
    [months, paidBills]
  )

  // Category breakdown (paid only)
  const categoryData = useMemo(() => {
    const map = new Map<BillCategory, number>()
    for (const b of paidBills) {
      map.set(b.category, (map.get(b.category) ?? 0) + (b.paidAmount ?? b.amount))
    }
    return [...map.entries()]
      .map(([cat, value]) => ({ cat, value, ...CATEGORY_META[cat], color: CAT_COLOR[cat] }))
      .sort((a, b) => b.value - a.value)
  }, [paidBills])

  // Top billers (paid only)
  const billerData = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of paidBills) {
      map.set(b.biller, (map.get(b.biller) ?? 0) + (b.paidAmount ?? b.amount))
    }
    return [...map.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [paidBills])

  const totalPaid  = paidBills.reduce((s, b) => s + (b.paidAmount ?? b.amount), 0)
  const avgPerMonth = months.length > 1 ? totalPaid / months.length : null

  const rangeLabel = range === 'year'
    ? currentMonth().slice(0, 4)
    : range === 'month'
      ? currentMonth()
      : `last-${range}`

  const hasData = paidBills.length > 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <h1 className="text-xl font-bold text-slate-100">Reports</h1>
      </div>

      {/* Range tabs */}
      <div className="px-4 shrink-0">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {RANGE_OPTS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setRange(opt.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                range === opt.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Summary cards */}
        <div className={`grid gap-3 mt-4 ${avgPerMonth !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <SummaryCard
            label="Total paid"
            value={`₱${totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            sub={formatMonthLabel(months[0]) + (months.length > 1 ? ' – ' + formatMonthLabel(months[months.length - 1]) : '')}
          />
          <SummaryCard
            label="Bills paid"
            value={String(paidBills.length)}
            sub={`of ${allBills.length} total`}
          />
          {avgPerMonth !== null && (
            <SummaryCard
              label="Avg / month"
              value={`₱${avgPerMonth.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              sub={`over ${months.length} months`}
            />
          )}
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <span className="text-5xl">📭</span>
            <p className="text-slate-500 text-sm">No paid bills in this period.</p>
          </div>
        ) : (
          <>
            {/* Monthly spending trend (only if > 1 month) */}
            {months.length > 1 && (
              <ChartSection title="Monthly spending">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Category breakdown */}
            {categoryData.length > 0 && (
              <ChartSection title="By category">
                <div className="flex flex-col items-center gap-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        strokeWidth={0}
                      >
                        {categoryData.map(d => (
                          <Cell key={d.cat} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend */}
                  <div className="w-full space-y-2">
                    {categoryData.map(d => {
                      const pct = totalPaid > 0 ? Math.round((d.value / totalPaid) * 100) : 0
                      return (
                        <div key={d.cat} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-sm text-slate-300 flex-1">{d.icon} {d.label}</span>
                          <span className="text-xs text-slate-500">{pct}%</span>
                          <span className="text-sm font-medium text-slate-200 tabular-nums">
                            {formatCurrency(d.value)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </ChartSection>
            )}

            {/* Top billers */}
            {billerData.length > 0 && (
              <ChartSection title="Top billers">
                <ResponsiveContainer width="100%" height={Math.max(120, billerData.length * 36)}>
                  <BarChart
                    data={billerData}
                    layout="vertical"
                    margin={{ top: 0, right: 60, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} label={{
                      position: 'right',
                      formatter: (v: number) => `₱${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`,
                      fill: '#94a3b8',
                      fontSize: 11,
                    }} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}
          </>
        )}

        {/* Export */}
        <button
          onClick={() => exportCSV(allBills, rangeLabel)}
          disabled={allBills.length === 0}
          className="mt-4 w-full py-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 active:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          <span>📥</span>
          <span>Export CSV</span>
        </button>

        <div className="h-4" />
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl px-3 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-100 leading-tight tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{sub}</p>
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">{title}</p>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        {children}
      </div>
    </div>
  )
}
