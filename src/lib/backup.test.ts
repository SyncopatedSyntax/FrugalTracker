import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import type { Category, RecurringTransaction, Transaction } from '@/db/types'
import { buildBackup, buildTransactionsCSV, isValidBackup, restoreBackup, type BackupFile } from './backup'

const categories: Category[] = [
  {
    id: 'c1',
    name: 'Groceries',
    icon: '🛒',
    color: '#000',
    type: 'expense',
    sortOrder: 0,
    usageCount: 1,
    isArchived: 0,
  },
]

const transaction: Transaction = {
  id: 't1',
  type: 'expense',
  amount: 25,
  currency: 'USD',
  categoryId: 'c1',
  note: 'milk',
  tags: ['errand'],
  date: '2026-01-01',
  createdAt: 1,
  updatedAt: 1,
  baseAmount: 25,
  baseRate: 1,
}

describe('buildTransactionsCSV', () => {
  it('negates expense amounts and resolves category names', () => {
    const csv = buildTransactionsCSV([transaction], categories)
    expect(csv).toContain('-25')
    expect(csv).toContain('Groceries')
    expect(csv).toContain('errand')
  })

  it('sorts rows newest date first', () => {
    const older = { ...transaction, id: 't2', date: '2025-01-01' }
    const csv = buildTransactionsCSV([older, transaction], categories)
    const lines = csv.trim().split('\n')
    expect(lines[1]).toContain('2026-01-01')
    expect(lines[2]).toContain('2025-01-01')
  })

  it('falls back to an empty category name for an unknown categoryId', () => {
    const csv = buildTransactionsCSV([{ ...transaction, categoryId: 'missing' }], categories)
    const lines = csv.trim().split('\n')
    const header = lines[0].split(',')
    const row = lines[1].split(',')
    expect(row[header.indexOf('Category')]).toBe('')
  })
})

describe('isValidBackup', () => {
  it('accepts a well-shaped backup', () => {
    expect(isValidBackup({ app: 'frugaltracker', categories: [], transactions: [], rates: [] })).toBe(
      true,
    )
  })

  it('rejects missing arrays', () => {
    expect(isValidBackup({ app: 'frugaltracker' })).toBe(false)
  })

  it('rejects the wrong app name', () => {
    expect(
      isValidBackup({ app: 'other', categories: [], transactions: [], rates: [] }),
    ).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isValidBackup(null)).toBe(false)
    expect(isValidBackup('backup')).toBe(false)
  })
})

describe('buildBackup / restoreBackup — recurring transactions', () => {
  const rule: RecurringTransaction = {
    id: 'r1',
    type: 'expense',
    amount: 1450,
    currency: 'USD',
    categoryId: 'c1',
    note: 'Rent',
    tags: [],
    frequency: 'monthly',
    startDate: '2026-01-01',
    endDate: null,
    nextDueDate: '2026-08-01',
    createdAt: 1,
    updatedAt: 1,
  }

  beforeEach(async () => {
    await Promise.all([
      db.recurringTransactions.clear(),
      db.transactions.clear(),
      db.categories.clear(),
      db.settings.clear(),
      db.tags.clear(),
      db.budgets.clear(),
      db.rates.clear(),
    ])
  })

  it('round-trips recurring rules through build/restore', async () => {
    await db.recurringTransactions.add(rule)
    const backup = await buildBackup()
    expect(backup.recurringTransactions).toEqual([rule])

    await db.recurringTransactions.clear()
    await restoreBackup(backup)
    expect(await db.recurringTransactions.toArray()).toEqual([rule])
  })

  it('restoring a legacy backup with no recurringTransactions field does not throw', async () => {
    const legacy: BackupFile = {
      app: 'frugaltracker',
      version: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      settings: undefined,
      categories: [],
      tags: [],
      budgets: [],
      rates: [],
      transactions: [],
    }
    await expect(restoreBackup(legacy)).resolves.not.toThrow()
    expect(await db.recurringTransactions.toArray()).toEqual([])
  })
})
