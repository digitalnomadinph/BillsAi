import { useState } from 'react'
import { format } from 'date-fns'
import type { BillCategory } from '../db'
import { getBillingMonth, CATEGORY_META, COMMON_BILLERS } from '../utils/bills'

export interface BillFormSubmitData {
  biller: string
  category: BillCategory
  amount: number
  currency: string
  dueDate: string
  billingMonth: string
  notes?: string
  updatedAt: string
}

interface Props {
  initial?: {
    biller?: string
    category?: BillCategory
    amount?: string
    dueDate?: string
    notes?: string
  }
  amountHint?: number
  onSave: (data: BillFormSubmitData) => Promise<void>
  saveLabel?: string
}

export default function BillForm({ initial = {}, amountHint, onSave, saveLabel = 'Save Bill' }: Props) {
  const [biller, setBiller] = useState(initial.biller ?? '')
  const [category, setCategory] = useState<BillCategory>(initial.category ?? 'utility')
  const [amount, setAmount] = useState(initial.amount ?? '')
  const [dueDate, setDueDate] = useState(initial.dueDate ?? format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function handleBillerChange(value: string) {
    setBiller(value)
    const match = COMMON_BILLERS.find(b => b.name.toLowerCase() === value.toLowerCase())
    if (match) setCategory(match.category)
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!biller.trim()) e.biller = 'Biller name is required'
    const amtNum = parseFloat(amount)
    if (!amount || isNaN(amtNum) || amtNum <= 0) e.amount = 'Enter a valid amount greater than 0'
    if (!dueDate) e.dueDate = 'Due date is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || saving) return
    setSaving(true)
    try {
      await onSave({
        biller: biller.trim(),
        category,
        amount: parseFloat(amount),
        currency: 'PHP',
        dueDate,
        billingMonth: getBillingMonth(dueDate),
        notes: notes.trim() || undefined,
        updatedAt: new Date().toISOString(),
      })
    } finally {
      setSaving(false)
    }
  }

  const labelCls = 'block text-sm font-semibold text-slate-300 mb-2'
  const inputCls = 'w-full px-4 py-3.5 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 focus:border-blue-500 focus:outline-none text-base'
  const errCls = 'text-red-400 text-xs mt-1.5'

  return (
    <form onSubmit={handleSubmit} className="px-4 py-5 flex flex-col gap-5">
      {/* Biller */}
      <div>
        <label htmlFor="biller" className={labelCls}>Biller Name</label>
        <input
          id="biller"
          list="billers-datalist"
          value={biller}
          onChange={e => handleBillerChange(e.target.value)}
          placeholder="e.g. Meralco, PLDT, Netflix"
          className={inputCls}
          autoComplete="off"
          autoCorrect="off"
        />
        <datalist id="billers-datalist">
          {COMMON_BILLERS.map(b => <option key={b.name} value={b.name} />)}
        </datalist>
        {errors.biller && <p className={errCls}>{errors.biller}</p>}
      </div>

      {/* Category */}
      <div>
        <label htmlFor="category" className={labelCls}>Category</label>
        <select
          id="category"
          value={category}
          onChange={e => setCategory(e.target.value as BillCategory)}
          className={inputCls}
        >
          {(Object.entries(CATEGORY_META) as [BillCategory, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
            <option key={key} value={key}>{icon} {label}</option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className={labelCls}>Amount Due</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold select-none">₱</span>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputCls + ' pl-9'}
          />
        </div>
        {amountHint !== undefined && amountHint > 0 && (
          <p className="text-xs text-slate-500 mt-1.5">
            Last paid: ₱{amountHint.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
        )}
        {errors.amount && <p className={errCls}>{errors.amount}</p>}
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="dueDate" className={labelCls}>Due Date</label>
        <input
          id="dueDate"
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className={inputCls}
        />
        {errors.dueDate && <p className={errCls}>{errors.dueDate}</p>}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className={labelCls}>
          Notes <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Account number, reference, etc."
          rows={2}
          className={inputCls + ' resize-none'}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base active:bg-blue-700 disabled:opacity-50 transition-colors mt-1"
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </form>
  )
}
