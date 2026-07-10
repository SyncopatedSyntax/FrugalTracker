// Force a west-of-UTC zone so any regression to raw `new Date(isoString)`
// parsing (which the app must never do — see lib/date.ts) shows up as a
// failing test instead of silently passing in a UTC CI environment.
process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import {
  periodRange,
  prorateMonthly,
  rollingMonthlyAverage,
  sameRangeLastYear,
  sumInRange,
} from './budgetMath'

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

describe('periodRange', () => {
  const now = new Date(2026, 6, 5) // Sunday, July 5 2026

  it('week: starts on Monday when firstDayOfWeek=1', () => {
    expect(periodRange('week', now, 1)).toEqual({ startISO: '2026-06-29', endISO: '2026-07-05' })
  })

  it('week: starts on Sunday when firstDayOfWeek=0', () => {
    expect(periodRange('week', now, 0)).toEqual({ startISO: '2026-07-05', endISO: '2026-07-05' })
  })

  it('month: starts on the 1st', () => {
    expect(periodRange('month', now, 1)).toEqual({ startISO: '2026-07-01', endISO: '2026-07-05' })
  })

  it('year: starts on Jan 1', () => {
    expect(periodRange('year', now, 1)).toEqual({ startISO: '2026-01-01', endISO: '2026-07-05' })
  })
})

describe('prorateMonthly (B3: honours firstDayOfWeek)', () => {
  const now = new Date(2026, 6, 5) // Sunday, July 5 2026; 5/31 days elapsed

  it('month: scales by elapsed-day fraction', () => {
    expect(prorateMonthly(310, 'month', now, 1)).toBeCloseTo(50, 10)
  })

  it('week: Monday-anchored week has more elapsed days than Sunday-anchored', () => {
    expect(prorateMonthly(310, 'week', now, 1)).toBeCloseTo(70, 10) // Mon Jun29 - Sun Jul5 = 7 days
    expect(prorateMonthly(310, 'week', now, 0)).toBeCloseTo(10, 10) // Sun Jul5 - Sun Jul5 = 1 day
  })

  it('year: scales by elapsed full months + day fraction', () => {
    expect(prorateMonthly(310, 'year', now, 1)).toBeCloseTo(1910, 10)
  })
})

describe('sameRangeLastYear (B1: day-preserving, no tz off-by-one)', () => {
  it('preserves day-of-month instead of resetting to the 1st', () => {
    const range = { startISO: '2026-06-29', endISO: '2026-07-05' }
    expect(sameRangeLastYear(range)).toEqual({ startISO: '2025-06-29', endISO: '2025-07-05' })
  })

  it('is stable across a leap-year Feb 29 boundary', () => {
    const range = { startISO: '2024-02-29', endISO: '2024-03-01' }
    expect(sameRangeLastYear(range)).toEqual({ startISO: '2023-02-28', endISO: '2023-03-01' })
  })
})

describe('rollingMonthlyAverage (B1: parseISO, not raw new Date(iso))', () => {
  it('averages over complete trailing months anchored on the 1st, unaffected by tz', () => {
    const now = new Date(2026, 6, 5) // July 5 2026
    const txs = [
      tx({ date: '2026-04-01', baseAmount: 300 }),
      tx({ date: '2026-05-01', baseAmount: 300 }),
      tx({ date: '2026-06-01', baseAmount: 300 }),
    ]
    // Window is April-June (3 months); a tz-driven day-1 rollback to March
    // would wrongly stretch this to 4 months and give 225 instead of 300.
    expect(rollingMonthlyAverage(txs, 'cat1', now)).toBe(300)
  })

  it('returns 0 when there is no matching history', () => {
    expect(rollingMonthlyAverage([], 'cat1', new Date(2026, 6, 5))).toBe(0)
  })

  it('caps the window to however much history exists', () => {
    const now = new Date(2026, 6, 5)
    const txs = [tx({ date: '2026-06-10', baseAmount: 100 })]
    // Only June has history; window is exactly June (1 month).
    expect(rollingMonthlyAverage(txs, 'cat1', now)).toBe(100)
  })
})

describe('sumInRange', () => {
  const txs = [
    tx({ date: '2026-07-01', type: 'expense', categoryId: 'cat1', baseAmount: 50 }),
    tx({ date: '2026-07-05', type: 'expense', categoryId: 'cat2', baseAmount: 20 }),
    tx({ date: '2026-06-30', type: 'expense', categoryId: 'cat1', baseAmount: 999 }), // out of range
    tx({ date: '2026-07-03', type: 'income', categoryId: 'cat1', baseAmount: 500 }),
  ]
  const range = { startISO: '2026-07-01', endISO: '2026-07-05' }

  it('filters by type, category, and date range', () => {
    expect(sumInRange(txs, range, 'expense', 'cat1')).toBe(50)
    expect(sumInRange(txs, range, 'expense', null)).toBe(70)
    expect(sumInRange(txs, range, 'income', null)).toBe(500)
  })
})
