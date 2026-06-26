import Dexie, { type Table } from 'dexie'

export type BillCategory =
  | 'utility' | 'internet' | 'mobile' | 'rent' | 'subscription'
  | 'loan' | 'insurance' | 'tuition' | 'credit_card' | 'other'

export interface Bill {
  id: string
  biller: string
  category: BillCategory
  amount: number
  currency: string
  dueDate: string        // ISO YYYY-MM-DD
  billingMonth: string   // YYYY-MM derived from dueDate
  status: 'unpaid' | 'paid' | 'overdue'
  paidDate?: string
  paidAmount?: number
  isRecurring: boolean
  recurrenceDay?: number
  invoiceFileId?: string
  paymentProofFileId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface StoredFile {
  id: string
  blob: Blob
  mimeType: string
  name: string
  driveFileId?: string
  createdAt: string
}

export interface Settings {
  id: 'app'
  currency: string
  reminderLeadDays: number[]
  largeFontMode: boolean
  googleSync: {
    enabled: boolean
    clientId?: string
    folderId?: string
    sheetId?: string
    lastSyncAt?: string
  }
  geminiApiKey?: string
  notificationsEnabled?: boolean
}

class BillsDatabase extends Dexie {
  bills!: Table<Bill>
  files!: Table<StoredFile>
  settings!: Table<Settings>

  constructor() {
    super('BillsAiDB')
    this.version(1).stores({
      bills: 'id, dueDate, billingMonth, status, biller, category',
      files: 'id, createdAt',
      settings: 'id',
    })
  }
}

export const db = new BillsDatabase()

export async function initSettings() {
  const existing = await db.settings.get('app')
  if (!existing) {
    await db.settings.put({
      id: 'app',
      currency: 'PHP',
      reminderLeadDays: [7, 3, 1, 0],
      largeFontMode: false,
      googleSync: { enabled: false },
    })
  }
}
