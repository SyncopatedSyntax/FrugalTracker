import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import { cashflowByBucket, deltaVs, monthlySeriesFor } from './compute'
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

describe('monthlySeriesFor', () => {
  const anchor = new Date(2026, 6, 15) // July 2026

  it('returns trailing months oldest → newest with explicit zero months', () => {
    const txs = [
      tx({ categoryId: 'groc', date: '2026-07-01', baseAmount: 50 }),
      tx({ categoryId: 'groc', date: '2026-05-10', baseAmount: 120 }),
      tx({ categoryId: 'groc', date: '2026-05-20', baseAmount: 80 }),
    ]
    const series = monthlySeriesFor(txs, 'groc', 3, anchor)
    expect(series.map((p) => p.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(series.map((p) => p.value)).toEqual([200, 0, 50])
    expect(series.map((p) => p.count)).toEqual([2, 0, 1])
  })

  it('ignores other categories and transactions outside the window', () => {
    const txs = [
      tx({ categoryId: 'groc', date: '2026-07-01', baseAmount: 50 }),
      tx({ categoryId: 'rent', date: '2026-07-01', baseAmount: 900 }),
      tx({ categoryId: 'groc', date: '2025-01-01', baseAmount: 999 }),
    ]
    const series = monthlySeriesFor(txs, 'groc', 2, anchor)
    expect(series.map((p) => p.value)).toEqual([0, 50])
  })

  it('labels months with a 2-digit year, unambiguous across a year boundary', () => {
    const series = monthlySeriesFor([], 'groc', 3, new Date(2026, 0, 10)) // Jan 2026
    expect(series.map((p) => p.label)).toEqual(['Nov 25', 'Dec 25', 'Jan 26'])
  })
})

describe('deltaVs', () => {
  it('computes fractional change against a positive baseline', () => {
    expect(deltaVs(100, 114)).toBeCloseTo(0.14)
    expect(deltaVs(200, 150)).toBeCloseTo(-0.25)
    expect(deltaVs(50, 50)).toBe(0)
  })

  it('returns null when there is no usable baseline', () => {
    expect(deltaVs(0, 100)).toBeNull()
    expect(deltaVs(-10, 100)).toBeNull()
  })
})
