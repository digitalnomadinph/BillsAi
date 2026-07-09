import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Bill, BillCategory } from '../db'
import { extractFromFile, type ExtractionResult } from '../lib/extractor'
import BillForm, { type BillFormSubmitData } from '../components/BillForm'
import { CATEGORY_META, formatMonthLabel } from '../utils/bills'

type Stage =
  | { tag: 'choose' }
  | {
      tag: 'extracting'
      blob: Blob
      mimeType: string
      fileName: string
      previewUrl: string | null
      status: string
      pct: number
    }
  | {
      tag: 'confirm'
      result: ExtractionResult
      blob: Blob
      mimeType: string
      fileName: string
      previewUrl: string | null
    }
  | { tag: 'manual'; prefill?: { biller?: string; category?: BillCategory; amountHint?: number } }

export default function Add() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>({ tag: 'choose' })
  const [showRaw, setShowRaw] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // Past paid bills — deduplicated by biller, most recently paid first
  const history = useLiveQuery(async () => {
    const paid = await db.bills.filter(b => b.status === 'paid').toArray()
    paid.sort((a, b) => (b.paidDate ?? b.updatedAt).localeCompare(a.paidDate ?? a.updatedAt))
    const seen = new Map<string, Bill>()
    for (const bill of paid) {
      if (!seen.has(bill.biller)) seen.set(bill.biller, bill)
    }
    return Array.from(seen.values()).slice(0, 8)
  }, [], []) ?? []

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
    const previewUrl = mimeType.startsWith('image/') ? URL.createObjectURL(file) : null

    setStage({ tag: 'extracting', blob: file, mimeType, fileName: file.name, previewUrl, status: 'Starting…', pct: 0 })

    try {
      const result = await extractFromFile(file, mimeType, (status, pct) => {
        setStage(prev => prev.tag === 'extracting' ? { ...prev, status, pct } : prev)
      })
      setStage(prev =>
        prev.tag === 'extracting'
          ? { tag: 'confirm', result, blob: prev.blob, mimeType: prev.mimeType, fileName: prev.fileName, previewUrl: prev.previewUrl }
          : prev
      )
    } catch {
      setStage(prev =>
        prev.tag === 'extracting'
          ? { tag: 'confirm', result: { confidence: 0, rawText: '' }, blob: prev.blob, mimeType: prev.mimeType, fileName: prev.fileName, previewUrl: prev.previewUrl }
          : prev
      )
    }
  }

  async function handleSave(data: BillFormSubmitData, blob?: Blob, mimeType?: string, fileName?: string) {
    const now = new Date().toISOString()
    let invoiceFileId: string | undefined
    if (blob) {
      invoiceFileId = crypto.randomUUID()
      await db.files.add({ id: invoiceFileId, blob, mimeType: mimeType ?? 'application/octet-stream', name: fileName ?? 'invoice', createdAt: now })
    }
    await db.bills.add({ id: crypto.randomUUID(), ...data, status: 'unpaid', isRecurring: false, invoiceFileId, createdAt: now, updatedAt: data.updatedAt })
    navigate('/')
  }

  function goBack() {
    if (stage.tag === 'choose') navigate(-1)
    else setStage({ tag: 'choose' })
  }

  const title =
    stage.tag === 'extracting' ? 'Reading Bill…' :
    stage.tag === 'confirm'    ? 'Confirm Details' :
    'Add Bill'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800 shrink-0">
        <button onClick={goBack} className="w-10 h-10 flex items-center justify-center text-xl text-slate-400 rounded-full active:bg-slate-800" aria-label="Back">←</button>
        <h1 className="text-lg font-bold text-slate-100">{title}</h1>
      </div>

      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={handleFileSelected} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={handleFileSelected} />

      {stage.tag === 'choose' && (
        <ChooseStage
          history={history}
          onCamera={() => cameraRef.current?.click()}
          onFile={() => fileRef.current?.click()}
          onManual={() => setStage({ tag: 'manual' })}
          onFromHistory={bill => setStage({
            tag: 'manual',
            prefill: {
              biller: bill.biller,
              category: bill.category,
              amountHint: bill.paidAmount ?? bill.amount,
            },
          })}
        />
      )}

      {stage.tag === 'extracting' && (
        <ExtractingStage previewUrl={stage.previewUrl} status={stage.status} pct={stage.pct} />
      )}

      {stage.tag === 'confirm' && (
        <div className="flex-1 overflow-y-auto">
          <ConfidenceBanner confidence={stage.result.confidence} />
          <BillForm
            initial={{
              biller: stage.result.biller,
              category: stage.result.category,
              amount: stage.result.amount !== undefined ? String(stage.result.amount) : undefined,
              dueDate: stage.result.dueDate,
            }}
            onSave={data => handleSave(data, stage.blob, stage.mimeType, stage.fileName)}
            saveLabel="Save Bill"
          />
          {stage.result.rawText ? (
            <div className="px-4 pb-4">
              <button onClick={() => setShowRaw(r => !r)} className="text-xs text-slate-500 underline underline-offset-2">
                {showRaw ? 'Hide' : 'Show'} extracted text ›
              </button>
              {showRaw && (
                <pre className="mt-2 p-3 rounded-xl bg-slate-800 text-slate-500 text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {stage.result.rawText}
                </pre>
              )}
            </div>
          ) : null}
          <div className="h-4" />
        </div>
      )}

      {stage.tag === 'manual' && (
        <div className="flex-1 overflow-y-auto">
          <BillForm
            initial={{
              biller: stage.prefill?.biller,
              category: stage.prefill?.category,
            }}
            amountHint={stage.prefill?.amountHint}
            onSave={data => handleSave(data)}
            saveLabel="Save Bill"
          />
          <div className="h-4" />
        </div>
      )}
    </div>
  )
}

// ─── Stage sub-components ────────────────────────────────────

function ChooseStage({
  history, onCamera, onFile, onManual, onFromHistory,
}: {
  history: Bill[]
  onCamera: () => void
  onFile: () => void
  onManual: () => void
  onFromHistory: (bill: Bill) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto px-5 pt-6 pb-6 flex flex-col gap-4">
      <p className="text-sm text-slate-400 text-center leading-relaxed">
        Upload your invoice to auto-fill the details, or enter them manually.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCamera} className="flex flex-col items-center gap-3 py-7 rounded-2xl bg-slate-800 border border-slate-700/60 active:bg-slate-700 transition-colors">
          <span className="text-4xl">📷</span>
          <span className="text-sm font-semibold text-slate-200">Take Photo</span>
        </button>
        <button onClick={onFile} className="flex flex-col items-center gap-3 py-7 rounded-2xl bg-slate-800 border border-slate-700/60 active:bg-slate-700 transition-colors">
          <span className="text-4xl">📁</span>
          <span className="text-sm font-semibold text-slate-200">Upload File</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-xs text-slate-600">or</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      <button onClick={onManual} className="w-full py-4 rounded-2xl bg-slate-800 border border-slate-700/60 font-semibold text-slate-200 active:bg-slate-700 flex items-center justify-center gap-2">
        <span>✏️</span>
        <span>Enter Manually</span>
      </button>

      {history.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-xs text-slate-600">or pick from history</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <div className="flex flex-col gap-2">
            {history.map(bill => {
              const lastAmount = bill.paidAmount ?? bill.amount
              const { icon } = CATEGORY_META[bill.category]
              const monthLabel = formatMonthLabel(bill.billingMonth)
              return (
                <button
                  key={bill.id}
                  onClick={() => onFromHistory(bill)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-800 border border-slate-700/60 active:bg-slate-700 text-left transition-colors"
                >
                  <span className="text-2xl w-8 text-center shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{bill.biller}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Last paid: ₱{lastAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · {monthLabel}
                    </p>
                  </div>
                  <span className="text-slate-600 text-lg shrink-0">›</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <p className="text-xs text-slate-600 text-center leading-relaxed px-2">
        Accepts JPEG, PNG and PDF. OCR runs on-device — your files never leave your phone.
      </p>
    </div>
  )
}

function ExtractingStage({ previewUrl, status, pct }: { previewUrl: string | null; status: string; pct: number }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-6 px-6 pt-8">
      {previewUrl ? (
        <div className="w-full max-w-xs rounded-2xl overflow-hidden border border-slate-700 bg-slate-800" style={{ aspectRatio: '3/4' }}>
          <img src={previewUrl} alt="Bill preview" className="w-full h-full object-contain" />
        </div>
      ) : (
        <div className="w-24 h-24 rounded-2xl bg-slate-800 flex items-center justify-center text-5xl border border-slate-700">📄</div>
      )}
      <div className="w-full max-w-xs space-y-3">
        <p className="text-sm text-slate-300 text-center min-h-[20px]">{status}</p>
        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-blue-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 text-center">
          First run downloads language data (~10 MB, cached after)
        </p>
      </div>
    </div>
  )
}

function ConfidenceBanner({ confidence }: { confidence: number }) {
  if (confidence === 0) return (
    <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 flex gap-2.5 items-start">
      <span className="text-lg shrink-0">⚠️</span>
      <div>
        <p className="text-sm font-semibold text-slate-300">Could not read bill</p>
        <p className="text-xs text-slate-500 mt-0.5">Please fill in the details below.</p>
      </div>
    </div>
  )
  if (confidence >= 0.7) return (
    <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-blue-950/60 border border-blue-800/40 flex gap-2.5 items-start">
      <span className="text-lg shrink-0">✅</span>
      <div>
        <p className="text-sm font-semibold text-blue-300">Fields extracted</p>
        <p className="text-xs text-slate-400 mt-0.5">We may have guessed — please review before saving.</p>
      </div>
    </div>
  )
  return (
    <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-amber-950/60 border border-amber-800/40 flex gap-2.5 items-start">
      <span className="text-lg shrink-0">🔍</span>
      <div>
        <p className="text-sm font-semibold text-amber-300">Partial extraction</p>
        <p className="text-xs text-slate-400 mt-0.5">Some fields may need correction — please review.</p>
      </div>
    </div>
  )
}
