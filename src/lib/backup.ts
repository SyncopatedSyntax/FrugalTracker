import Papa from 'papaparse'
import { db } from '@/db/db'
import type { Budget, Category, Rate, Settings, Tag, Transaction } from '@/db/types'
import { toISO } from './date'

export interface BackupFile {
  app: 'frugaltracker'
  version: number
  exportedAt: string
  settings: Settings | undefined
  categories: Category[]
  tags: Tag[]
  budgets: Budget[]
  rates: Rate[]
  transactions: Transaction[]
}

export async function buildBackup(): Promise<BackupFile> {
  const [settings, categories, tags, budgets, rates, transactions] = await Promise.all([
    db.settings.get('app'),
    db.categories.toArray(),
    db.tags.toArray(),
    db.budgets.toArray(),
    db.rates.toArray(),
    db.transactions.toArray(),
  ])
  return {
    app: 'frugaltracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    categories,
    tags,
    budgets,
    rates,
    transactions,
  }
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportJSON(): Promise<void> {
  const backup = await buildBackup()
  downloadFile(
    `frugaltracker-backup-${toISO(new Date())}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  )
}

export function buildTransactionsCSV(transactions: Transaction[], categories: Category[]): string {
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  const rows = transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((t) => ({
      Date: t.date,
      Type: t.type,
      Amount: t.type === 'expense' ? -t.amount : t.amount,
      Currency: t.currency,
      Category: catName.get(t.categoryId) ?? '',
      Note: t.note,
      Tags: t.tags.join(', '),
    }))
  return Papa.unparse(rows)
}

export async function exportCSV(): Promise<void> {
  const [categories, transactions] = await Promise.all([
    db.categories.toArray(),
    db.transactions.toArray(),
  ])
  downloadFile(
    `frugaltracker-${toISO(new Date())}.csv`,
    buildTransactionsCSV(transactions, categories),
    'text/csv;charset=utf-8',
  )
}

export function isValidBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false
  const d = data as Partial<BackupFile>
  return (
    d.app === 'frugaltracker' &&
    Array.isArray(d.categories) &&
    Array.isArray(d.transactions) &&
    Array.isArray(d.rates)
  )
}

/** Replace all local data with the backup's contents. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.settings, db.categories, db.tags, db.budgets, db.rates, db.transactions],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.categories.clear(),
        db.tags.clear(),
        db.budgets.clear(),
        db.rates.clear(),
        db.transactions.clear(),
      ])
      if (data.settings) await db.settings.put(data.settings)
      await db.categories.bulkAdd(data.categories)
      if (data.tags?.length) await db.tags.bulkAdd(data.tags)
      if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets)
      await db.rates.bulkAdd(data.rates)
      await db.transactions.bulkAdd(data.transactions)
    },
  )
}
