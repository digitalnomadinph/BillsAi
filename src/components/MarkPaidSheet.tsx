import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { db } from '../db'
import type { Bill } from '../db'

interface Props {
  bill: Bill
  onClose: () => void
  onDone: () => void
}

export default function MarkPaidSheet({ bill, onClose, onDone }: Props) {
  const [paidAmount, setPaidAmount] = useState(String(bill.amount))
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [proofBlob, setProofBlob] = useState<Blob | null>(null)
  const [proofMime, setProofMime] = useState('')
  const [proofName, setProofName] = useState('')
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function handleProofFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setProofBlob(file)
    setProofMime(file.type || 'image/jpeg')
    setProofName(file.name)
    setProofPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  function clearProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofBlob(null)
    setProofMime('')
    setProofName('')
    setProofPreview(null)
  }

  async function handleConfirm() {
    if (saving) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      let paymentProofFileId: string | undefined

      if (proofBlob) {
        paymentProofFileId = crypto.randomUUID()
        await db.files.add({
          id: paymentProofFileId,
          blob: proofBlob,
          mimeType: proofMime,
          name: proofName,
          createdAt: now,
        })
      }

      await db.bills.update(bill.id, {
        status: 'paid',
        paidDate,
        paidAmount: parseFloat(paidAmount) || bill.amount,
        ...(paymentProofFileId ? { paymentProofFileId } : {}),
        updatedAt: now,
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-4 py-3.5 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 focus:border-blue-500 focus:outline-none text-base'
  const labelCls = 'block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-50 p-3" onClick={onClose}>
      <div
        className="w-full bg-slate-900 border border-slate-700/60 rounded-2xl p-5 flex flex-col gap-5 max-h-[90svh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Mark as Paid</h2>
            <p className="text-sm text-slate-400 mt-0.5">{bill.biller}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-slate-400 rounded-full active:bg-slate-800 text-xl shrink-0"
          >
            ×
          </button>
        </div>

        {/* Amount paid */}
        <div>
          <label className={labelCls}>Amount Paid</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold select-none">₱</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
              className={inputCls + ' pl-9'}
            />
          </div>
        </div>

        {/* Date paid */}
        <div>
          <label className={labelCls}>Date Paid</label>
          <input
            type="date"
            value={paidDate}
            onChange={e => setPaidDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Proof upload */}
        <div>
          <label className={labelCls}>
            Payment Proof <span className="text-slate-600 normal-case font-normal">(optional)</span>
          </label>

          {proofPreview ? (
            <div className="relative rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
              <img src={proofPreview} alt="Proof preview" className="w-full max-h-36 object-contain" />
              <button
                onClick={clearProof}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full text-sm flex items-center justify-center"
              >×</button>
            </div>
          ) : proofBlob ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700">
              <span className="text-2xl shrink-0">📄</span>
              <span className="text-sm text-slate-300 truncate flex-1">{proofName}</span>
              <button onClick={clearProof} className="text-slate-500 shrink-0">✕</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-medium text-slate-300 active:bg-slate-700"
              >
                <span>📷</span><span>Camera</span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-medium text-slate-300 active:bg-slate-700"
              >
                <span>📁</span><span>Upload</span>
              </button>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleProofFile} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFile} />
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-base active:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Confirm Payment ✓'}
        </button>
      </div>
    </div>
  )
}
