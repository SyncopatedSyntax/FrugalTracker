import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import { cashflowByBucket } from './compute'
import type { Bucket } from './period'

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

function bucket(key: string, startISO: string, endISO: string): Bucket {
  return { key, label: key, fullLabel: key, startISO, endISO }
}

describe('cashflowByBucket', () => {
  it('computes per-bucket income/expense/net, not a running total', () => {
    const buckets = [bucket('jan', '2026-01-01', '2026-01-31'), bucket('feb', '2026-02-01', '2026-02-28')]
    const txs = [
      tx({ type: 'income', date: '2026-01-10', baseAmount: 1000 }),
      tx({ type: 'expense', date: '2026-01-15', baseAmount: 300 }),
      tx({ type: 'expense', date: '2026-02-05', baseAmount: 200 }),
    ]
    const result = cashflowByBucket(txs, buckets)
    expect(result.income).toEqual([1000, 0])
    expect(result.expense).toEqual([300, 200])
    // Feb's net must NOT carry over Jan's leftover +700 — it's -200, not +500.
    expect(result.net).toEqual([700, -200])
  })

  it('sums multiple transactions within the same bucket', () => {
    const buckets = [bucket('jan', '2026-01-01', '2026-01-31')]
    const txs = [
      tx({ type: 'income', date: '2026-01-05', baseAmount: 500 }),
      tx({ type: 'income', date: '2026-01-20', baseAmount: 250 }),
      tx({ type: 'expense', date: '2026-01-10', baseAmount: 100 }),
    ]
    const result = cashflowByBucket(txs, buckets)
    expect(result).toEqual({ income: [750], expense: [100], net: [650] })
  })

  it('includes a transaction dated exactly on a bucket boundary', () => {
    const buckets = [bucket('jan', '2026-01-01', '2026-01-31'), bucket('feb', '2026-02-01', '2026-02-28')]
    const txs = [tx({ type: 'income', date: '2026-01-31', baseAmount: 400 })]
    const result = cashflowByBucket(txs, buckets)
    expect(result.income).toEqual([400, 0])
  })

  it('returns all zeros for a bucket with no matching transactions', () => {
    const buckets = [bucket('jan', '2026-01-01', '2026-01-31')]
    const result = cashflowByBucket([], buckets)
    expect(result).toEqual({ income: [0], expense: [0], net: [0] })
  })
})
