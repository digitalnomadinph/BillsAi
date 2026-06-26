import { db } from '../db'
import type { Bill } from '../db'

// ─── GIS type declarations ────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => void
            error_callback?: (err: unknown) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

// ─── Types ────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean
  pushed?: number
  pulled?: number
  filesUploaded?: number
  error?: string
}

// ─── Constants ────────────────────────────────────────────────

const SCOPES       = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME  = 'Bills Ai'
const SHEET_NAME   = 'Bills Ai - Data'
const HEADERS: (keyof BillRow)[] = [
  'id', 'biller', 'category', 'amount', 'currency', 'dueDate', 'billingMonth',
  'status', 'paidDate', 'paidAmount', 'isRecurring', 'recurrenceDay',
  'driveInvoiceFileId', 'driveProofFileId', 'notes', 'createdAt', 'updatedAt',
]

interface BillRow {
  id: string; biller: string; category: string; amount: string; currency: string
  dueDate: string; billingMonth: string; status: string; paidDate: string
  paidAmount: string; isRecurring: string; recurrenceDay: string
  driveInvoiceFileId: string; driveProofFileId: string; notes: string
  createdAt: string; updatedAt: string
}

// ─── Token management ─────────────────────────────────────────

let _token: string | null = null
let _tokenExpiry = 0

export function clearToken() {
  _token = null
  _tokenExpiry = 0
}

async function loadGIS(): Promise<void> {
  if (window.google?.accounts?.oauth2) return
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = 'https://accounts.google.com/gsi/client'
    el.onload  = () => resolve()
    el.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(el)
  })
}

export async function requestToken(clientId: string): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token
  await loadGIS()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: resp => {
        if (resp.access_token) {
          _token = resp.access_token
          _tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000
          resolve(resp.access_token)
        } else {
          reject(new Error(resp.error ?? 'Authorization failed'))
        }
      },
      error_callback: err => reject(err instanceof Error ? err : new Error(String(err))),
    })
    client.requestAccessToken()
  })
}

// ─── Drive API helpers ────────────────────────────────────────

async function gFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Google API ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res
}

async function findDriveFile(token: string, q: string): Promise<string | null> {
  const res  = await gFetch(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)
  const data = await res.json() as { files: { id: string }[] }
  return data.files[0]?.id ?? null
}

async function ensureFolder(token: string): Promise<string> {
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const found = await findDriveFile(token, q)
  if (found) return found
  const res  = await gFetch(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return ((await res.json()) as { id: string }).id
}

async function ensureSheet(token: string, folderId: string, existingId?: string): Promise<string> {
  if (existingId) {
    try {
      await gFetch(token, `https://www.googleapis.com/drive/v3/files/${existingId}?fields=id`)
      return existingId
    } catch { /* fall through and recreate */ }
  }
  const q = `name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
  const found = await findDriveFile(token, q)
  if (found) return found
  const res = await gFetch(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: SHEET_NAME,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    }),
  })
  return ((await res.json()) as { id: string }).id
}

async function uploadBlob(
  token: string, blob: Blob, name: string, folderId: string, existingId?: string
): Promise<string> {
  const boundary  = 'bills_ai_boundary'
  const meta      = JSON.stringify(existingId ? { name } : { name, parents: [folderId] })
  const preamble  = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`)
  const epilogue  = new TextEncoder().encode(`\r\n--${boundary}--`)
  const blobBytes = new Uint8Array(await blob.arrayBuffer())
  const body = new Uint8Array(preamble.length + blobBytes.length + epilogue.length)
  body.set(preamble); body.set(blobBytes, preamble.length); body.set(epilogue, preamble.length + blobBytes.length)

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
  const res = await gFetch(token, url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return ((await res.json()) as { id: string }).id
}

// ─── Sheets API helpers ───────────────────────────────────────

async function readSheet(token: string, sheetId: string): Promise<string[][]> {
  const res  = await gFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:R`)
  const data = await res.json() as { values?: string[][] }
  return data.values ?? []
}

async function writeSheet(token: string, sheetId: string, rows: string[][]): Promise<void> {
  await gFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:R:clear`, { method: 'POST' })
  await gFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  })
}

// ─── Bill ↔ Row conversion ────────────────────────────────────

function billToRow(bill: Bill, invDriveId: string | undefined, proofDriveId: string | undefined): string[] {
  const r: BillRow = {
    id:                 bill.id,
    biller:             bill.biller,
    category:           bill.category,
    amount:             String(bill.amount),
    currency:           bill.currency,
    dueDate:            bill.dueDate,
    billingMonth:       bill.billingMonth,
    status:             bill.status,
    paidDate:           bill.paidDate ?? '',
    paidAmount:         bill.paidAmount !== undefined ? String(bill.paidAmount) : '',
    isRecurring:        bill.isRecurring ? '1' : '0',
    recurrenceDay:      bill.recurrenceDay !== undefined ? String(bill.recurrenceDay) : '',
    driveInvoiceFileId: invDriveId ?? '',
    driveProofFileId:   proofDriveId ?? '',
    notes:              bill.notes ?? '',
    createdAt:          bill.createdAt,
    updatedAt:          bill.updatedAt,
  }
  return HEADERS.map(h => r[h])
}

function rowToBill(headers: string[], row: string[]): Bill | null {
  const g = (field: string) => row[headers.indexOf(field)] ?? ''
  const id = g('id'); const biller = g('biller'); const dueDate = g('dueDate')
  if (!id || !biller || !dueDate) return null
  return {
    id,
    biller,
    category:      (g('category') as Bill['category']) || 'other',
    amount:        parseFloat(g('amount')) || 0,
    currency:      g('currency') || 'PHP',
    dueDate,
    billingMonth:  g('billingMonth') || dueDate.slice(0, 7),
    status:        (g('status') as Bill['status']) || 'unpaid',
    paidDate:      g('paidDate') || undefined,
    paidAmount:    g('paidAmount') ? parseFloat(g('paidAmount')) : undefined,
    isRecurring:   g('isRecurring') === '1',
    recurrenceDay: g('recurrenceDay') ? parseInt(g('recurrenceDay')) : undefined,
    notes:         g('notes') || undefined,
    createdAt:     g('createdAt') || new Date().toISOString(),
    updatedAt:     g('updatedAt') || new Date().toISOString(),
  }
}

// ─── High-level sync ──────────────────────────────────────────

export async function syncPush(clientId: string): Promise<SyncResult> {
  try {
    const token    = await requestToken(clientId)
    const settings = await db.settings.get('app')
    const bills    = await db.bills.toArray()

    const folderId = await ensureFolder(token)
    const sheetId  = await ensureSheet(token, folderId, settings?.googleSync.sheetId)

    // Upload new files
    let filesUploaded = 0
    const invIds   = new Map<string, string>()
    const proofIds = new Map<string, string>()

    for (const bill of bills) {
      for (const [fileId, map] of [[bill.invoiceFileId, invIds], [bill.paymentProofFileId, proofIds]] as [string | undefined, Map<string, string>][]) {
        if (!fileId) continue
        const f = await db.files.get(fileId)
        if (!f?.blob) continue
        const driveId = await uploadBlob(token, f.blob, f.name, folderId, f.driveFileId)
        map.set(bill.id, driveId)
        if (!f.driveFileId) { await db.files.update(f.id, { driveFileId: driveId }); filesUploaded++ }
      }
    }

    await writeSheet(token, sheetId, [
      HEADERS as string[],
      ...bills.map(b => billToRow(b, invIds.get(b.id), proofIds.get(b.id))),
    ])

    await db.settings.update('app', {
      googleSync: { ...settings?.googleSync, enabled: true, folderId, sheetId, lastSyncAt: new Date().toISOString() },
    })

    return { ok: true, pushed: bills.length, filesUploaded }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function syncPull(clientId: string): Promise<SyncResult> {
  try {
    const token    = await requestToken(clientId)
    const settings = await db.settings.get('app')
    const sheetId  = settings?.googleSync.sheetId
    if (!sheetId) return { ok: false, error: 'No sheet linked — run a backup first.' }

    const rows    = await readSheet(token, sheetId)
    const headers = rows[0]
    if (!headers?.includes('id')) return { ok: false, error: 'Sheet is missing header row.' }

    let pulled = 0
    for (const row of rows.slice(1)) {
      const remote = rowToBill(headers, row)
      if (!remote) continue
      const local = await db.bills.get(remote.id)
      if (local) {
        if (remote.updatedAt > local.updatedAt) { await db.bills.update(remote.id, remote); pulled++ }
      } else {
        await db.bills.add(remote); pulled++
      }
    }

    await db.settings.update('app', {
      googleSync: { ...settings?.googleSync, lastSyncAt: new Date().toISOString() },
    })

    return { ok: true, pulled }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
