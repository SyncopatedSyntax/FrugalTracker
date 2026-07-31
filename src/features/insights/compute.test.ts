import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import {
  cashflowByBucket,
  dailyTotals,
  deltaVs,
  heatCeiling,
  labelBreakdown,
  monthlySeriesFor,
  savingsRate,
  sumFlow,
  UNTAGGED_KEY,
} from './compute'
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

describe('savingsRate', () => {
  it('is the fraction of income kept', () => {
    expect(savingsRate(1000, 750)).toBeCloseTo(0.25)
    expect(savingsRate(1000, 1000)).toBe(0)
  })

  it('goes negative when expenses exceed income', () => {
    expect(savingsRate(1000, 1200)).toBeCloseTo(-0.2)
  })

  it('returns null when there is no income', () => {
    expect(savingsRate(0, 500)).toBeNull()
    expect(savingsRate(-5, 500)).toBeNull()
  })
})

describe('dailyTotals', () => {
  const anchor = new Date(2026, 1, 15) // February 2026 (28 days)

  it('produces one cell per day of the month, indexed from day 1', () => {
    const result = dailyTotals([], anchor)
    expect(result).toHaveLength(28)
    expect(result[0]).toMatchObject({ day: 1, iso: '2026-02-01', expense: 0, income: 0, count: 0 })
    expect(result[27]).toMatchObject({ day: 28, iso: '2026-02-28' })
  })

  it('sums expense and income separately per day and counts entries', () => {
    const txs = [
      tx({ type: 'expense', date: '2026-02-03', baseAmount: 40 }),
      tx({ type: 'expense', date: '2026-02-03', baseAmount: 10 }),
      tx({ type: 'income', date: '2026-02-03', baseAmount: 1000 }),
    ]
    const result = dailyTotals(txs, anchor)
    expect(result[2]).toMatchObject({ day: 3, expense: 50, income: 1000, count: 3 })
  })

  it('ignores transactions outside the anchored month', () => {
    const txs = [
      tx({ type: 'expense', date: '2026-01-31', baseAmount: 999 }),
      tx({ type: 'expense', date: '2026-03-01', baseAmount: 999 }),
      tx({ type: 'expense', date: '2026-02-10', baseAmount: 25 }),
    ]
    const result = dailyTotals(txs, anchor)
    expect(result.reduce((s, d) => s + d.expense, 0)).toBe(25)
    expect(result[9]).toMatchObject({ day: 10, expense: 25 })
  })
})

describe('heatCeiling', () => {
  it('returns 0 when there is no spend', () => {
    expect(heatCeiling([])).toBe(0)
    expect(heatCeiling([0, 0, 0])).toBe(0)
  })

  it('uses the max for a small sample (too few for a stable percentile)', () => {
    expect(heatCeiling([10, 20, 5, 999])).toBe(999)
  })

  it('takes the ~92nd percentile once there are enough days', () => {
    // 100 values 1..100 → floor(0.92 * 99) = 91 → sorted[91] = 92.
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(heatCeiling(values)).toBe(92)
  })

  it('is robust to outliers — a lone huge day does not set the ceiling', () => {
    // 30 ordinary days around 10, plus one 5000 rent/vacation spike.
    const values = [...Array.from({ length: 30 }, () => 10), 5000]
    const ceiling = heatCeiling(values)
    expect(ceiling).toBeLessThan(5000)
    expect(ceiling).toBeLessThanOrEqual(10)
  })

  it('ignores zero-spend days when ranking', () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 100, 200]
    // Only [100, 200] are positive → < 8 → falls back to their max.
    expect(heatCeiling(values)).toBe(200)
  })
})

describe('labelBreakdown', () => {
  const palette = ['#aaa', '#bbb', '#ccc'] as const
  const get = (slices: ReturnType<typeof labelBreakdown>, key: string) =>
    slices.find((s) => s.key === key)

  it('splits a multi-tag transaction across its tags, but reports each full total', () => {
    const txs = [tx({ baseAmount: 220, tags: ['holidays', 'family'] })]
    const slices = labelBreakdown(txs, 'expense', palette)
    // The full amount under each tag — what the transactions list shows.
    expect(get(slices, 'holidays')?.value).toBe(220)
    expect(get(slices, 'family')?.value).toBe(220)
    // Halved for the ring, so the two together account for the $220 once.
    expect(get(slices, 'holidays')?.share).toBe(110)
    expect(get(slices, 'family')?.share).toBe(110)
  })

  it('splits three ways for a three-tag transaction', () => {
    const txs = [tx({ baseAmount: 90, tags: ['a', 'b', 'c'] })]
    const slices = labelBreakdown(txs, 'expense', palette)
    expect(slices.map((s) => s.share)).toEqual([30, 30, 30])
    expect(slices.every((s) => s.value === 90)).toBe(true)
  })

  it('shares plus untagged reconcile to the flow total, while values overshoot it', () => {
    const txs = [
      tx({ baseAmount: 220, tags: ['holidays', 'family'] }),
      tx({ baseAmount: 300, tags: ['holidays'] }),
      tx({ baseAmount: 500, tags: [] }),
      tx({ type: 'income', baseAmount: 9999, tags: ['ignored'] }),
    ]
    const slices = labelBreakdown(txs, 'expense', palette)
    const total = sumFlow(txs, 'expense')
    expect(total).toBe(1020)
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(total, 10)
    // Values double-count the $220 that carries two tags.
    expect(slices.reduce((s, x) => s + x.value, 0)).toBe(total + 220)
  })

  it('counts stay whole — a two-tag transaction counts once under each tag', () => {
    const txs = [tx({ baseAmount: 220, tags: ['holidays', 'family'] })]
    const slices = labelBreakdown(txs, 'expense', palette)
    expect(get(slices, 'holidays')?.count).toBe(1)
    expect(get(slices, 'family')?.count).toBe(1)
  })

  it('pins untagged last even when it dwarfs every tag, and omits it when nothing is untagged', () => {
    const withUntagged = labelBreakdown(
      [tx({ baseAmount: 10, tags: ['small'] }), tx({ baseAmount: 5000, tags: [] })],
      'expense',
      palette,
    )
    expect(withUntagged.map((s) => s.key)).toEqual(['small', UNTAGGED_KEY])
    expect(get(withUntagged, UNTAGGED_KEY)?.value).toBe(5000)

    const allTagged = labelBreakdown([tx({ baseAmount: 10, tags: ['small'] })], 'expense', palette)
    expect(allTagged.map((s) => s.key)).toEqual(['small'])
  })

  it('reports a fully untagged period as a single 100% untagged slice', () => {
    const txs = [tx({ baseAmount: 40 }), tx({ baseAmount: 60 })]
    const slices = labelBreakdown(txs, 'expense', palette)
    expect(slices).toHaveLength(1)
    expect(slices[0].key).toBe(UNTAGGED_KEY)
    expect(slices[0].share).toBe(sumFlow(txs, 'expense'))
  })

  it('ranks tags by share, not by their overlapping full totals', () => {
    const txs = [
      // `shared` has the bigger full total (400) but only 200 of attributable
      // spend, so `solo` must outrank it or the donut would draw out of order.
      tx({ baseAmount: 400, tags: ['shared', 'other'] }),
      tx({ baseAmount: 300, tags: ['solo'] }),
    ]
    const slices = labelBreakdown(txs, 'expense', palette)
    expect(slices.map((s) => s.key)).toEqual(['solo', 'shared', 'other'])
    expect(get(slices, 'shared')?.value).toBe(400)
    expect(get(slices, 'shared')?.share).toBe(200)
  })

  it('narrows both the tags and the untagged residual to one category', () => {
    const txs = [
      tx({ categoryId: 'travel', baseAmount: 700, tags: ['vacation'] }),
      tx({ categoryId: 'dining', baseAmount: 100, tags: ['vacation'] }),
      tx({ categoryId: 'travel', baseAmount: 50, tags: [] }),
      tx({ categoryId: 'dining', baseAmount: 900, tags: [] }),
    ]
    const slices = labelBreakdown(txs, 'expense', palette, 'travel')
    expect(get(slices, 'vacation')?.value).toBe(700)
    expect(get(slices, UNTAGGED_KEY)?.value).toBe(50)
    // Still reconciles, now against the category's own total.
    const catTotal = sumFlow(
      txs.filter((t) => t.categoryId === 'travel'),
      'expense',
    )
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(catTotal, 10)
  })
})
