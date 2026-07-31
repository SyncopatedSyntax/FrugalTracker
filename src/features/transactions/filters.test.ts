import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '@/db/types'
import { activeFilterCount, emptyFilters, filterTransactions, type Filters } from './filters'

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    type: 'expense',
    amount: 100,
    currency: 'USD',
    categoryId: 'cat1',
    note: '',
    tags: [],
    date: '2026-01-01',
    createdAt: 0,
    updatedAt: 0,
    baseAmount: 100,
    baseRate: 1,
    ...overrides,
  }
}

function cat(id: string, name: string, icon: string, color: string): Category {
  return {
    id,
    name,
    icon,
    color,
    type: 'expense',
    sortOrder: 0,
    usageCount: 0,
    isArchived: 0,
  }
}

const categoryMap = new Map<string, Category>([
  ['cat1', cat('cat1', 'Groceries', '🛒', '#aaa')],
  ['cat2', cat('cat2', 'Travel', '✈️', '#bbb')],
])

const withFilters = (over: Partial<Filters>): Filters => ({ ...emptyFilters, ...over })
const run = (txs: Transaction[], over: Partial<Filters>, keyword = '') =>
  filterTransactions(txs, withFilters(over), keyword, categoryMap)

describe('filterTransactions — untagged', () => {
  const txs = [
    tx({ id: 'bare', tags: [] }),
    tx({ id: 'tagged', tags: ['vacation'] }),
    tx({ id: 'multi', tags: ['vacation', 'family'] }),
  ]

  it('keeps only transactions carrying no tags at all', () => {
    expect(run(txs, { untagged: true }).map((t) => t.id)).toEqual(['bare'])
  })

  it('is inert when off', () => {
    expect(run(txs, { untagged: false })).toHaveLength(3)
  })

  it('composes with type, category and date bounds', () => {
    const mixed = [
      tx({ id: 'keep', categoryId: 'cat2', date: '2026-03-05' }),
      tx({ id: 'wrongCat', categoryId: 'cat1', date: '2026-03-05' }),
      tx({ id: 'wrongDate', categoryId: 'cat2', date: '2026-01-05' }),
      tx({ id: 'wrongType', categoryId: 'cat2', date: '2026-03-05', type: 'income' }),
      tx({ id: 'hasTag', categoryId: 'cat2', date: '2026-03-05', tags: ['x'] }),
    ]
    const result = run(mixed, {
      untagged: true,
      type: 'expense',
      categoryIds: ['cat2'],
      from: '2026-03-01',
      to: '2026-03-31',
    })
    expect(result.map((t) => t.id)).toEqual(['keep'])
  })

  it('yields nothing when combined with a tag filter — the UI keeps them exclusive', () => {
    expect(run(txs, { untagged: true, tags: ['vacation'] })).toHaveLength(0)
  })

  it('still applies the keyword search', () => {
    const notes = [
      tx({ id: 'match', note: 'Weekly shop' }),
      tx({ id: 'miss', note: 'Gas' }),
      tx({ id: 'taggedMatch', note: 'Weekly shop', tags: ['x'] }),
    ]
    expect(run(notes, { untagged: true }, 'weekly').map((t) => t.id)).toEqual(['match'])
  })
})

describe('activeFilterCount', () => {
  it('counts untagged as the tag filter, not as an extra one', () => {
    expect(activeFilterCount(withFilters({ untagged: true }))).toBe(1)
    expect(activeFilterCount(withFilters({ tags: ['a'] }))).toBe(1)
    // Never reachable through the UI, but it must not double-count.
    expect(activeFilterCount(withFilters({ untagged: true, tags: ['a'] }))).toBe(1)
  })

  it('is zero for the empty filter set and adds up across groups', () => {
    expect(activeFilterCount(emptyFilters)).toBe(0)
    expect(
      activeFilterCount(
        withFilters({ type: 'expense', categoryIds: ['cat1'], untagged: true, from: '2026-01-01' }),
      ),
    ).toBe(4)
  })
})
