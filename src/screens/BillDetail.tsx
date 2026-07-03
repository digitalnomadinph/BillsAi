import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { db } from '../db'
import { getBillingMonth } from '../utils/bills'
import BillForm, { type BillFormSubmitData } from '../components/BillForm'
import MarkPaidSheet from '../components/MarkPaidSheet'
import ProofViewer from '../components/ProofViewer'

export default function BillDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [uploadingProof, setUploadingProof] = useState(false)
  const proofRef = useRef<HTMLInputElement>(null)

  const bill = useLiveQuery(() => (id ? db.bills.get(id) : undefined), [id])

  if (bill === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-5xl">😕</span>
        <p className="text-slate-400 font-medium">Bill not found.</p>
        <button onClick={() => navigate('/')} className="text-blue-400 text-sm underline underline-offset-2">
          Go Home
        </button>
      </div>
    )
  }

  const isPaid = bill.status === 'paid'

  async function handleProofFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !bill) return
    e.target.value = ''
    setUploadingProof(true)
    try {
      const now = new Date().toISOString()
      const fileId = crypto.randomUUID()
      await db.files.add({
        id: fileId,
        blob: file,
        mimeType: file.type || 'image/jpeg',
        name: file.name,
        createdAt: now,
      })
      await db.bills.update(bill.id, { paymentProofFileId: fileId, updatedAt: now })
    } finally {
      setUploadingProof(false)
    }
  }

  async function handleMarkUnpaid() {
    if (!bill) return
    const { paidDate: _pd, paidAmount: _pa, paymentProofFileId: _pf, ...rest } = bill
    await db.bills.put({ ...rest, status: 'unpaid', updatedAt: new Date().toISOString() })
  }

  async function handleDelete() {
    if (!bill) return
    await db.bills.delete(bill.id)
    navigate('/', { replace: true })
  }

  async function handleSave(data: BillFormSubmitData) {
    if (!bill) return
    await db.bills.update(bill.id, {
      biller: data.biller,
      category: data.category,
      amount: data.amount,
      dueDate: data.dueDate,
      billingMonth: getBillingMonth(data.dueDate),
      isRecurring: data.isRecurring,
      recurrenceDay: data.recurrenceDay,
      notes: data.notes,
      updatedAt: data.updatedAt,
    })
    navigate(-1)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center text-xl text-slate-400 rounded-full active:bg-slate-800"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-slate-100 truncate flex-1 text-center px-2">
          {bill.biller}
        </h1>
        <button
          onClick={() => setShowDelete(true)}
          className="w-10 h-10 flex items-center justify-center text-red-400 rounded-full active:bg-slate-800"
          aria-label="Delete bill"
        >
          🗑
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status banner */}
        {!isPaid ? (
          <div className="mx-4 mt-4 p-4 rounded-xl bg-green-950/50 border border-green-800/40 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-green-400">Ready to pay?</p>
              <p className="text-xs text-slate-500 mt-0.5">Set amount, date, and optional receipt</p>
            </div>
            <button
              onClick={() => setShowMarkPaid(true)}
              className="px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm active:bg-green-700 shrink-0"
            >
              Mark Paid ✓
            </button>
          </div>
        ) : (
          <div className="mx-4 mt-4 px-4 py-4 rounded-xl bg-green-950/50 border border-green-800/40 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-green-400">
                  ✅ Paid on {bill.paidDate ? format(new Date(bill.paidDate + 'T00:00:00'), 'MMMM d, yyyy') : '—'}
                </p>
                {bill.paidAmount !== undefined && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Amount paid: ₱{bill.paidAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <button
                onClick={handleMarkUnpaid}
                className="shrink-0 text-xs text-slate-500 underline underline-offset-2 active:text-slate-300"
              >
                Undo payment
              </button>
            </div>

            {/* Proof */}
            {bill.paymentProofFileId ? (
              <ProofViewer
                fileId={bill.paymentProofFileId}
                onReplace={() => proofRef.current?.click()}
              />
            ) : (
              <button
                onClick={() => proofRef.current?.click()}
                disabled={uploadingProof}
                className="flex items-center gap-2 text-sm text-slate-400 underline underline-offset-2 disabled:opacity-50"
              >
                <span>📎</span>
                <span>{uploadingProof ? 'Uploading…' : 'Upload payment receipt'}</span>
              </button>
            )}

            <input
              ref={proofRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleProofFile}
            />
          </div>
        )}

        {/* Edit form */}
        <BillForm
          initial={{
            biller: bill.biller,
            category: bill.category,
            amount: String(bill.amount),
            dueDate: bill.dueDate,
            isRecurring: bill.isRecurring,
            recurrenceDay: bill.recurrenceDay ? String(bill.recurrenceDay) : '',
            notes: bill.notes ?? '',
          }}
          onSave={handleSave}
          saveLabel="Save Changes"
        />
        <div className="h-4" />
      </div>

      {/* Mark Paid sheet */}
      {showMarkPaid && (
        <MarkPaidSheet
          bill={bill}
          onClose={() => setShowMarkPaid(false)}
          onDone={() => setShowMarkPaid(false)}
        />
      )}

      {/* Delete confirmation sheet */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[100] p-4" onClick={() => setShowDelete(false)}>
          <div className="w-full sm:max-w-md bg-slate-800 rounded-2xl px-5 pt-5 pb-safe flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100">Delete "{bill.biller}"?</h3>
            <p className="text-sm text-slate-400">This cannot be undone.</p>
            <button
              onClick={handleDelete}
              className="w-full py-4 bg-red-600 text-white rounded-xl font-bold active:bg-red-700"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDelete(false)}
              className="w-full py-3.5 bg-slate-700 text-slate-200 rounded-xl font-semibold active:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
