import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addTransaction, deleteTransaction, setBudget, updateTransaction } from './repo'
import { parseISO } from '@/lib/date'

const CATEGORY_ID = 'cat-groceries'

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.tags.clear(),
    db.settings.clear(),
    db.rates.clear(),
  ])
  await db.categories.add({
    id: CATEGORY_ID,
    name: 'Groceries',
    icon: '🛒',
    color: '#ef4444',
    type: 'expense',
    sortOrder: 0,
    usageCount: 0,
    isArchived: 0,
  })
})

async function tag(name: string) {
  return db.tags.where('name').equals(name.toLowerCase()).first()
}

describe('bumpTags via addTransaction/updateTransaction', () => {
  it("uses the transaction's own date for lastUsedAt, not wall-clock time", async () => {
    await addTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['vacation'],
      date: '2020-01-15',
    })
    const t = await tag('vacation')
    expect(t?.lastUsedAt).toBe(parseISO('2020-01-15').getTime())
  })

  it('never moves lastUsedAt backwards when an older-dated transaction reuses the tag', async () => {
    await addTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['coffee'],
      date: '2026-06-01',
    })
    await addTransaction({
      type: 'expense',
      amount: 5,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['coffee'],
      date: '2019-03-01',
    })
    const t = await tag('coffee')
    expect(t?.lastUsedAt).toBe(parseISO('2026-06-01').getTime())
    expect(t?.usageCount).toBe(2)
  })

  it('advances lastUsedAt when a newer-dated transaction reuses the tag', async () => {
    await addTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['coffee'],
      date: '2019-03-01',
    })
    await addTransaction({
      type: 'expense',
      amount: 5,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['coffee'],
      date: '2026-06-01',
    })
    const t = await tag('coffee')
    expect(t?.lastUsedAt).toBe(parseISO('2026-06-01').getTime())
  })

  it("updateTransaction re-tagging uses the transaction's (possibly edited) date", async () => {
    const id = await addTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: [],
      date: '2020-01-15',
    })
    await updateTransaction(id, { tags: ['staples'] })
    const t = await tag('staples')
    expect(t?.lastUsedAt).toBe(parseISO('2020-01-15').getTime())
  })

  it('deleteTransaction decrements usage without touching lastUsedAt ordering', async () => {
    const id = await addTransaction({
      type: 'expense',
      amount: 10,
      currency: 'USD',
      categoryId: CATEGORY_ID,
      note: '',
      tags: ['onetime'],
      date: '2020-01-15',
    })
    await deleteTransaction(id)
    expect(await tag('onetime')).toBeUndefined()
  })
})

describe('setBudget — one budget per category', () => {
  beforeEach(async () => {
    await db.budgets.clear()
  })

  const make = (categoryId: string | null, amount: number, id?: string) => ({
    id,
    categoryId,
    period: 'monthly' as const,
    amount,
    currency: 'USD',
  })

  it('creates one budget per category and updates in place on edit', async () => {
    await setBudget(make('groc', 500))
    const groc = await db.budgets.filter((b) => b.categoryId === 'groc').first()
    await setBudget(make('groc', 600, groc!.id))
    const all = await db.budgets.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].amount).toBe(600)
  })

  it('never duplicates when a new budget targets an already-budgeted category', async () => {
    await setBudget(make('groc', 500))
    // No id (as if "create"), same category — should fold into the existing row.
    await setBudget(make('groc', 999))
    const grocBudgets = await db.budgets.filter((b) => b.categoryId === 'groc').toArray()
    expect(grocBudgets).toHaveLength(1)
    expect(grocBudgets[0].amount).toBe(999)
  })

  it('folds an edit that repoints a budget onto a category another budget owns (B11)', async () => {
    await setBudget(make('groc', 500))
    await setBudget(make('coffee', 60))
    const groc = await db.budgets.filter((b) => b.categoryId === 'groc').first()
    // Edit the Groceries budget to point at Coffee, which Coffee already owns.
    await setBudget(make('coffee', 80, groc!.id))
    const all = await db.budgets.toArray()
    expect(all).toHaveLength(1) // not two coffee budgets, and the groc row is gone
    expect(all[0].categoryId).toBe('coffee')
    expect(all[0].amount).toBe(80)
  })

  it('keeps the overall budget distinct from a category budget', async () => {
    await setBudget(make(null, 2000))
    await setBudget(make('groc', 500))
    const all = await db.budgets.toArray()
    expect(all).toHaveLength(2)
  })
})
