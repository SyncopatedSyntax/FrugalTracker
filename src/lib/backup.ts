import Papa from 'papaparse'
import { db } from '@/db/db'
import type {
  Budget,
  Category,
  Rate,
  RecurringTransaction,
  Settings,
  Tag,
  Transaction,
} from '@/db/types'
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
  /** Optional: absent in backups made before this field existed. */
  recurringTransactions?: RecurringTransaction[]
}

export async function buildBackup(): Promise<BackupFile> {
  const [settings, categories, tags, budgets, rates, transactions, recurringTransactions] =
    await Promise.all([
      db.settings.get('app'),
      db.categories.toArray(),
      db.tags.toArray(),
      db.budgets.toArray(),
      db.rates.toArray(),
      db.transactions.toArray(),
      db.recurringTransactions.toArray(),
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
    recurringTransactions,
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

/** The `BackupFile.version` this build knows how to read. A backup written by
 * a newer app version (higher number) is rejected rather than silently
 * mis-restored. Bump this (and add a migration) when the on-disk shape
 * changes incompatibly. */
export const CURRENT_BACKUP_VERSION = 1

/** How many rows were dropped per table during a restore because they were
 * malformed (missing a primary key / required field, wrong types). Absent
 * keys mean nothing was dropped for that table. */
export type RestoreReport = Partial<
  Record<'categories' | 'tags' | 'budgets' | 'rates' | 'transactions' | 'recurringTransactions', number>
>

/* --------------------- Per-row restore sanitizers ---------------------- */
// A restore trusts a file's *shape* only as far as isValidBackup's shallow
// check; the rows inside can still be malformed (a hand-edited JSON, an older
// export, a truncated download). Coerce each row's fields and drop any that
// are missing something the UI would crash on (e.g. `tags: null`, a bad
// `date`), so a partial file restores what it can instead of poisoning the DB.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object'
const str = (x: unknown, fallback = ''): string => (typeof x === 'string' ? x : fallback)
const num = (x: unknown, fallback = 0): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback
const strArr = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []
const finiteOrUndef = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined

function cleanCategory(r: unknown): Category | null {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  return {
    id: r.id,
    name: r.name,
    icon: str(r.icon, '❓'),
    color: str(r.color, '#64748b'),
    type: r.type === 'income' ? 'income' : 'expense',
    sortOrder: num(r.sortOrder),
    usageCount: num(r.usageCount),
    isArchived: r.isArchived === 1 ? 1 : 0,
  }
}

function cleanTransaction(r: unknown): Transaction | null {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.categoryId !== 'string') return null
  if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) return null
  // baseAmount/baseRate left undefined when unusable — backfillBaseAmounts
  // (run after every restore and on boot) fills them from the rate table.
  return {
    id: r.id,
    type: r.type === 'income' ? 'income' : 'expense',
    amount: num(r.amount),
    currency: str(r.currency, 'USD'),
    categoryId: r.categoryId,
    note: str(r.note),
    tags: strArr(r.tags),
    date: r.date,
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    baseAmount: finiteOrUndef(r.baseAmount) as number,
    baseRate: finiteOrUndef(r.baseRate) as number,
  }
}

function cleanTag(r: unknown): Tag | null {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.name !== 'string') return null
  return { id: r.id, name: r.name, usageCount: num(r.usageCount), lastUsedAt: num(r.lastUsedAt) }
}

function cleanBudget(r: unknown): Budget | null {
  if (!isObj(r) || typeof r.id !== 'string') return null
  const amount = num(r.amount)
  if (amount <= 0) return null
  return {
    id: r.id,
    categoryId: typeof r.categoryId === 'string' ? r.categoryId : null,
    period: 'monthly',
    amount,
    currency: str(r.currency, 'USD'),
  }
}

function cleanRate(r: unknown): Rate | null {
  if (!isObj(r) || typeof r.currency !== 'string') return null
  const rate = num(r.rate)
  if (rate <= 0) return null
  return { currency: r.currency, rate, updatedAt: num(r.updatedAt, Date.now()) }
}

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly']
function cleanRecurring(r: unknown): RecurringTransaction | null {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.categoryId !== 'string') return null
  if (typeof r.startDate !== 'string' || !ISO_DATE.test(r.startDate)) return null
  if (typeof r.nextDueDate !== 'string' || !ISO_DATE.test(r.nextDueDate)) return null
  return {
    id: r.id,
    type: r.type === 'income' ? 'income' : 'expense',
    amount: num(r.amount),
    currency: str(r.currency, 'USD'),
    categoryId: r.categoryId,
    note: str(r.note),
    tags: strArr(r.tags),
    frequency: (typeof r.frequency === 'string' && FREQUENCIES.includes(r.frequency)
      ? r.frequency
      : 'monthly') as RecurringTransaction['frequency'],
    startDate: r.startDate,
    endDate: typeof r.endDate === 'string' && ISO_DATE.test(r.endDate) ? r.endDate : null,
    nextDueDate: r.nextDueDate,
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
  }
}

function sanitize<T>(rows: unknown, clean: (r: unknown) => T | null): { rows: T[]; dropped: number } {
  if (!Array.isArray(rows)) return { rows: [], dropped: 0 }
  const out: T[] = []
  let dropped = 0
  for (const r of rows) {
    const c = clean(r)
    if (c) out.push(c)
    else dropped++
  }
  return { rows: out, dropped }
}

/** Replace all local data with the backup's contents. Rejects a backup from a
 * newer app version, and drops (rather than importing) any malformed rows —
 * returning a per-table count of what was skipped so the caller can tell the
 * user. Always followed by `backfillBaseAmounts()` (see callers) to repair any
 * transaction whose locked-in base amount didn't survive sanitization. */
export async function restoreBackup(data: BackupFile): Promise<RestoreReport> {
  if (typeof data.version === 'number' && data.version > CURRENT_BACKUP_VERSION) {
    throw new Error(
      `This backup was made by a newer version of the app (v${data.version}). Update the app before restoring it.`,
    )
  }

  const categories = sanitize(data.categories, cleanCategory)
  const transactions = sanitize(data.transactions, cleanTransaction)
  const tags = sanitize(data.tags, cleanTag)
  const budgets = sanitize(data.budgets, cleanBudget)
  const rates = sanitize(data.rates, cleanRate)
  const recurring = sanitize(data.recurringTransactions, cleanRecurring)

  await db.transaction(
    'rw',
    [
      db.settings,
      db.categories,
      db.tags,
      db.budgets,
      db.rates,
      db.transactions,
      db.recurringTransactions,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.categories.clear(),
        db.tags.clear(),
        db.budgets.clear(),
        db.rates.clear(),
        db.transactions.clear(),
        db.recurringTransactions.clear(),
      ])
      if (isObj(data.settings)) await db.settings.put({ ...(data.settings as Settings), id: 'app' })
      if (categories.rows.length) await db.categories.bulkAdd(categories.rows)
      if (tags.rows.length) await db.tags.bulkAdd(tags.rows)
      if (budgets.rows.length) await db.budgets.bulkAdd(budgets.rows)
      if (rates.rows.length) await db.rates.bulkAdd(rates.rows)
      if (transactions.rows.length) await db.transactions.bulkAdd(transactions.rows)
      if (recurring.rows.length) await db.recurringTransactions.bulkAdd(recurring.rows)
    },
  )

  const report: RestoreReport = {}
  if (categories.dropped) report.categories = categories.dropped
  if (transactions.dropped) report.transactions = transactions.dropped
  if (tags.dropped) report.tags = tags.dropped
  if (budgets.dropped) report.budgets = budgets.dropped
  if (rates.dropped) report.rates = rates.dropped
  if (recurring.dropped) report.recurringTransactions = recurring.dropped
  return report
}

/** A short "Skipped N invalid …" summary for a restore report, or '' when
 * nothing was dropped. */
export function summarizeRestore(report: RestoreReport): string {
  const parts = Object.entries(report)
    .filter(([, n]) => n && n > 0)
    .map(([table, n]) => `${n} ${table}`)
  return parts.length ? `Skipped ${parts.join(', ')}` : ''
}
