import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  addRecurringTransaction,
  deleteRecurringTransaction,
  generateDueRecurringTransactions,
  updateRecurringTransaction,
} from './recurring'
import { addDays, toISO, todayISO } from '@/lib/date'

/** `isDemoModeOn()` reads a `localStorage` flag, which isn't a global in the
 * node test environment — stub a minimal store so the demo-mode guard can be
 * exercised (same approach as `lib/githubBackup.test.ts`). */
const fakeStorage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => fakeStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void fakeStorage.set(key, value),
  removeItem: (key: string) => void fakeStorage.delete(key),
})
function setDemoMode(on: boolean): void {
  if (on) fakeStorage.set('ft-demo-mode', '1')
  else fakeStorage.delete('ft-demo-mode')
}

const CATEGORY_ID = 'cat-groceries'

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
  await db.categories.add({
    id: CATEGORY_ID,
    name: 'Groceries',
    icon: '🛒',
    color: '#000000',
    type: 'expense',
    sortOrder: 0,
    usageCount: 0,
    isArchived: 0,
  })
  setDemoMode(false)
})

function daysAgoISO(n: number): string {
  return toISO(addDays(new Date(), -n))
}

describe('addRecurringTransaction', () => {
  it('does not generate anything for a future start date', async () => {
    await addRecurringTransaction({
      type: 'expense',
      amount: 50,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'monthly',
      startDate: toISO(addDays(new Date(), 10)),
      endDate: null,
    })
    expect(await db.transactions.count()).toBe(0)
  })

  it('generates immediately when the start date is today', async () => {
    await addRecurringTransaction({
      type: 'expense',
      amount: 50,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: 'Rent',
      tags: [],
      frequency: 'monthly',
      startDate: todayISO(),
      endDate: null,
    })
    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(1)
    expect(txs[0].date).toBe(todayISO())
    expect(txs[0].amount).toBe(50)
  })

  it('backfills every missed occurrence for a start date well in the past', async () => {
    // Daily rule starting 5 days ago -> today counts as due too, so 6 total.
    await addRecurringTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: daysAgoISO(5),
      endDate: null,
    })
    const txs = await db.transactions.toArray()
    expect(txs).toHaveLength(6)
    const dates = txs.map((t) => t.date).sort()
    expect(dates[0]).toBe(daysAgoISO(5))
    expect(dates[5]).toBe(todayISO())
  })

  it('advances nextDueDate to the first occurrence after today', async () => {
    const id = await addRecurringTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: daysAgoISO(2),
      endDate: null,
    })
    const rule = await db.recurringTransactions.get(id)
    expect(rule?.nextDueDate).toBe(toISO(addDays(new Date(), 1)))
  })

  it('never generates past an end date', async () => {
    await addRecurringTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: daysAgoISO(10),
      endDate: daysAgoISO(7),
    })
    const txs = await db.transactions.toArray()
    // Days -10, -9, -8, -7 = 4 occurrences; nothing after the end date.
    expect(txs).toHaveLength(4)
    expect(txs.every((t) => t.date <= daysAgoISO(7))).toBe(true)
  })
})

describe('updateRecurringTransaction', () => {
  it('only affects transactions generated after the edit, not already-generated ones', async () => {
    const id = await addRecurringTransaction({
      type: 'expense',
      amount: 50,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: todayISO(),
      endDate: null,
    })
    const before = await db.transactions.toArray()
    expect(before).toHaveLength(1)
    expect(before[0].amount).toBe(50)

    await updateRecurringTransaction(id, { amount: 999 })

    // No new occurrence is due yet (next is tomorrow), so still just the one
    // original transaction, and its amount is untouched by the edit.
    const after = await db.transactions.toArray()
    expect(after).toHaveLength(1)
    expect(after[0].amount).toBe(50)
  })
})

describe('deleteRecurringTransaction', () => {
  it('removes the rule but leaves already-generated transactions alone', async () => {
    const id = await addRecurringTransaction({
      type: 'expense',
      amount: 50,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: todayISO(),
      endDate: null,
    })
    await deleteRecurringTransaction(id)
    expect(await db.recurringTransactions.get(id)).toBeUndefined()
    expect(await db.transactions.count()).toBe(1)
  })
})

describe('Demo Mode guard', () => {
  it('generateDueRecurringTransactions is a no-op while Demo Mode is active', async () => {
    await db.recurringTransactions.add({
      id: 'rule-1',
      type: 'expense',
      amount: 50,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      frequency: 'daily',
      startDate: daysAgoISO(3),
      endDate: null,
      nextDueDate: daysAgoISO(3),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setDemoMode(true)
    const count = await generateDueRecurringTransactions()
    expect(count).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })

  it('add/update/delete throw while Demo Mode is active', async () => {
    setDemoMode(true)
    await expect(
      addRecurringTransaction({
        type: 'expense',
        amount: 1,
        currency: 'USD',
        categoryId: CATEGORY_ID,
        note: '',
        tags: [],
        frequency: 'daily',
        startDate: todayISO(),
        endDate: null,
      }),
    ).rejects.toThrow('Cannot manage recurring transactions while Demo Mode is active')
    await expect(updateRecurringTransaction('x', { amount: 1 })).rejects.toThrow()
    await expect(deleteRecurringTransaction('x')).rejects.toThrow()
  })
})
