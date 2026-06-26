import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { recognize } from 'tesseract.js'
import { parse, isValid, format } from 'date-fns'
import type { BillCategory } from '../db'
import { COMMON_BILLERS } from '../utils/bills'
import { db } from '../db'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

export interface ExtractionResult {
  biller?: string
  category?: BillCategory
  amount?: number
  dueDate?: string
  confidence: number  // 0–1
  rawText: string
}

type ProgressCb = (status: string, pct: number) => void

// ─── PDF ─────────────────────────────────────────────────────

async function extractPDFText(blob: Blob): Promise<string> {
  const data = await blob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item: unknown) => ('str' in (item as object) ? (item as { str: string }).str : ''))
      .join(' ')
    pages.push(line)
  }
  return pages.join('\n')
}

async function rasterizePDFPage(blob: Blob): Promise<Blob> {
  const data = await blob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2.0 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: ctx as any, viewport } as any).promise
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/jpeg', 0.9)
  )
}

// ─── OCR ─────────────────────────────────────────────────────

async function ocrImage(blob: Blob, onProgress?: ProgressCb): Promise<string> {
  const result = await recognize(blob, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (!onProgress) return
      if (m.status.includes('loading')) {
        onProgress('Loading OCR engine…', m.progress * 40)
      } else if (m.status === 'recognizing text') {
        onProgress('Reading text…', 40 + m.progress * 58)
      }
    },
  })
  return result.data.text
}

// ─── Heuristics ───────────────────────────────────────────────

const AMOUNT_LABELED = /(?:amount\s+due|total\s+amount\s+due|please\s+pay|balance\s+due|current\s+charges|amount\s+payable|total\s+due|total\s+bill)[:\s]*(?:PHP|₱|Php)?\s*([\d,]+\.?\d{0,2})/gi
const AMOUNT_CURRENCY = /(?:PHP|₱|Php)\s*([\d,]+\.\d{2})/g

function extractAmount(text: string): number | undefined {
  const labeled = [...text.matchAll(AMOUNT_LABELED)]
  if (labeled.length) {
    const vals = labeled.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0 && n < 1_000_000)
    if (vals.length) return Math.max(...vals)
  }
  const currency = [...text.matchAll(AMOUNT_CURRENCY)]
  if (currency.length) {
    const vals = currency.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0 && n < 1_000_000)
    if (vals.length) return Math.max(...vals)
  }
  return undefined
}

const DATE_LABEL = /(?:due\s+(?:date|on|before)|payment\s+due|pay\s+(?:on\/before|before|on|by)|billing\s+date)[:\s]+([A-Za-z0-9,\/ \-]+)/gi
const DATE_FMTS = [
  'MMMM d, yyyy', 'MMM d, yyyy', 'MMMM dd, yyyy', 'MMM dd, yyyy',
  'MM/dd/yyyy', 'dd/MM/yyyy', 'M/d/yyyy',
  'yyyy-MM-dd', 'dd-MMM-yyyy', 'dd MMM yyyy',
  'MMMM d yyyy', 'MMM d yyyy',
]

function tryParseDate(s: string): string | undefined {
  const c = s.trim().replace(/\s+/g, ' ').slice(0, 35)
  for (const fmt of DATE_FMTS) {
    try {
      const d = parse(c, fmt, new Date())
      if (isValid(d) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035)
        return format(d, 'yyyy-MM-dd')
    } catch { /* try next */ }
  }
  return undefined
}

function extractDueDate(text: string): string | undefined {
  for (const m of text.matchAll(DATE_LABEL)) {
    const parsed = tryParseDate(m[1].split('\n')[0])
    if (parsed) return parsed
  }
  for (const line of text.split('\n')) {
    if (/due|pay/i.test(line)) {
      const dm = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/)
      if (dm) {
        const parsed = tryParseDate(dm[1])
        if (parsed) return parsed
      }
    }
  }
  return undefined
}

function extractBiller(text: string): { name: string; category: BillCategory } | undefined {
  const lower = text.toLowerCase()
  // Longest match first to avoid partial hits
  const sorted = [...COMMON_BILLERS].sort((a, b) => b.name.length - a.name.length)
  for (const b of sorted) {
    if (lower.includes(b.name.toLowerCase())) return b
  }
  const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 3 && l.length < 60 && /[A-Za-z]/.test(l))
  return firstLine ? { name: firstLine, category: 'other' } : undefined
}

function analyzeText(rawText: string): ExtractionResult {
  const amount = extractAmount(rawText)
  const dueDate = extractDueDate(rawText)
  const billerInfo = extractBiller(rawText)
  let confidence = 0
  if (amount) confidence += 0.35
  if (dueDate) confidence += 0.35
  if (billerInfo?.category !== 'other' && billerInfo) confidence += 0.30
  else if (billerInfo) confidence += 0.10
  return {
    biller: billerInfo?.name,
    category: billerInfo?.category,
    amount,
    dueDate,
    confidence,
    rawText,
  }
}

// ─── Gemini enhancement (optional) ────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(blob)
  })
}

async function extractWithGemini(imageBlob: Blob, apiKey: string): Promise<Partial<ExtractionResult> | null> {
  try {
    const base64 = await blobToBase64(imageBlob)
    const mimeType = imageBlob.type.startsWith('image/') ? imageBlob.type : 'image/jpeg'
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: 'Extract from this bill/invoice and reply with JSON only (no markdown): {"biller":"string","amount":number,"dueDate":"YYYY-MM-DD","category":"utility|internet|mobile|rent|subscription|loan|insurance|tuition|credit_card|other"}' },
          ] }],
        }),
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    const raw = (json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '') as string
    const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      biller:   typeof parsed.biller === 'string' ? parsed.biller : undefined,
      amount:   typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : undefined,
      dueDate:  typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate) ? parsed.dueDate : undefined,
      category: typeof parsed.category === 'string' ? parsed.category as BillCategory : undefined,
      confidence: 0.92,
    }
  } catch {
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────

export async function extractFromFile(
  blob: Blob,
  mimeType: string,
  onProgress?: ProgressCb
): Promise<ExtractionResult> {
  let rawText = ''
  let imageForGemini: Blob = blob

  onProgress?.('Starting…', 5)

  if (mimeType === 'application/pdf') {
    onProgress?.('Reading PDF…', 10)
    try {
      rawText = await extractPDFText(blob)
      if (rawText.trim().length < 50) {
        // Scanned PDF — rasterize then OCR
        onProgress?.('Scanned PDF detected — running OCR…', 20)
        const pageImg = await rasterizePDFPage(blob)
        imageForGemini = pageImg
        rawText = await ocrImage(pageImg, onProgress)
      } else {
        onProgress?.('PDF text extracted', 90)
      }
    } catch {
      // Fallback: rasterize and OCR
      try {
        const pageImg = await rasterizePDFPage(blob)
        imageForGemini = pageImg
        rawText = await ocrImage(pageImg, onProgress)
      } catch { rawText = '' }
    }
  } else {
    rawText = await ocrImage(blob, onProgress)
  }

  onProgress?.('Analyzing text…', 98)
  const result = analyzeText(rawText)

  // Optional Gemini enhancement
  try {
    const settings = await db.settings.get('app')
    if (settings?.geminiApiKey) {
      onProgress?.('AI enhancing…', 99)
      const gemini = await extractWithGemini(imageForGemini, settings.geminiApiKey)
      if (gemini) {
        const merged: ExtractionResult = {
          ...result,
          ...(Object.fromEntries(Object.entries(gemini).filter(([, v]) => v !== undefined))),
          rawText,
        }
        onProgress?.('Done', 100)
        return merged
      }
    }
  } catch { /* ignore */ }

  onProgress?.('Done', 100)
  return result
}
