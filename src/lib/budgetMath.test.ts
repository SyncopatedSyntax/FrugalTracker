// Force a west-of-UTC zone so any regression to raw `new Date(isoString)`
// parsing (which the app must never do — see lib/date.ts) shows up as a
// failing test instead of silently passing in a UTC CI environment.
process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import {
  budgetHistory,
  budgetYtdPace,
  friendlyBudget,
  niceAxisMax,
  periodRange,
  prorateMonthly,
  rollingMonthlyAverage,
  sameRangeLastYear,
  spendingSnapshot,
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

describe('budgetHistory', () => {
  const anchor = new Date(2026, 6, 15) // July 2026

  it('returns trailing months oldest → newest, flagging overspends', () => {
    const txs = [
      tx({ categoryId: 'groc', date: '2026-07-02', baseAmount: 120 }),
      tx({ categoryId: 'groc', date: '2026-05-10', baseAmount: 40 }),
      tx({ categoryId: 'groc', date: '2026-05-25', baseAmount: 30 }),
    ]
    const h = budgetHistory(txs, 'groc', 100, 3, anchor)
    expect(h.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(h.map((m) => m.spent)).toEqual([70, 0, 120])
    expect(h.map((m) => m.over)).toEqual([false, false, true])
    expect(h.every((m) => m.limit === 100)).toBe(true)
  })

  it('ignores income and other categories; overall sums all expenses', () => {
    const txs = [
      tx({ categoryId: 'groc', date: '2026-07-01', baseAmount: 50 }),
      tx({ categoryId: 'rent', date: '2026-07-01', baseAmount: 900 }),
      tx({ type: 'income', categoryId: 'groc', date: '2026-07-01', baseAmount: 999 }),
    ]
    expect(budgetHistory(txs, 'groc', 100, 1, anchor)[0].spent).toBe(50)
    expect(budgetHistory(txs, null, 100, 1, anchor)[0].spent).toBe(950)
  })
})

describe('budgetYtdPace', () => {
  const now = new Date(2026, 6, 15) // July → 7 months elapsed

  it('budgets whole months elapsed × limit and nets against YTD spend', () => {
    const txs = [
      tx({ categoryId: 'groc', date: '2026-02-10', baseAmount: 400 }),
      tx({ categoryId: 'groc', date: '2026-06-20', baseAmount: 300 }),
      tx({ categoryId: 'groc', date: '2025-12-31', baseAmount: 999 }), // last year, excluded
    ]
    const p = budgetYtdPace(txs, 'groc', 500, now)
    expect(p.monthsElapsed).toBe(7)
    expect(p.budgeted).toBe(3500)
    expect(p.spent).toBe(700)
    expect(p.net).toBe(2800) // positive → ahead / under budget
  })

  it('goes negative when cumulative spend outruns the granted budget', () => {
    const txs = [tx({ categoryId: 'groc', date: '2026-03-01', baseAmount: 4000 })]
    const p = budgetYtdPace(txs, 'groc', 500, now)
    expect(p.net).toBe(-500) // 3500 budgeted − 4000 spent
  })
})

describe('spendingSnapshot', () => {
  // "Now" is mid-July 2026 → the window is the 6 complete months Jan–Jun.
  const now = new Date(2026, 6, 15)

  it('aggregates the trailing 6 complete months, excluding the current one', () => {
    const txs = [
      tx({ date: '2026-01-10', baseAmount: 100 }),
      tx({ date: '2026-02-10', baseAmount: 200 }),
      tx({ date: '2026-03-10', baseAmount: 300 }),
      tx({ date: '2026-04-10', baseAmount: 400 }),
      tx({ date: '2026-05-10', baseAmount: 500 }),
      tx({ date: '2026-06-10', baseAmount: 600 }),
      tx({ date: '2026-07-10', baseAmount: 9999 }), // current month — must be ignored
    ]
    const s = spendingSnapshot(txs, 'cat1', '2025-01-01', now)!
    expect(s.months.map((m) => m.key)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ])
    expect(s.months.map((m) => m.spent)).toEqual([100, 200, 300, 400, 500, 600])
    expect(s.average).toBe(350)
    expect(s.typical).toBe(350) // even count → mean of the two middle months
    expect(s.max).toBe(600)
  })

  it('clamps the window to the earliest transaction (no fake zero months)', () => {
    const txs = [
      tx({ date: '2026-05-10', baseAmount: 500 }),
      tx({ date: '2026-06-10', baseAmount: 700 }),
    ]
    const s = spendingSnapshot(txs, 'cat1', '2026-05-10', now)!
    expect(s.months.map((m) => m.key)).toEqual(['2026-05', '2026-06'])
    expect(s.average).toBe(600)
    expect(s.trend).toBeNull() // < 6 covered months
  })

  it('keeps genuine zero months when history predates the window', () => {
    const txs = [
      tx({ date: '2026-02-10', baseAmount: 300 }),
      tx({ date: '2026-06-10', baseAmount: 300 }),
    ]
    const s = spendingSnapshot(txs, 'cat1', '2025-06-01', now)!
    expect(s.months).toHaveLength(6)
    expect(s.months.filter((m) => m.spent === 0)).toHaveLength(4)
  })

  it('falls back typical → average when the median month is zero', () => {
    // A bill paid twice in 6 months: median 0 would be a useless suggestion.
    const txs = [
      tx({ date: '2026-01-10', baseAmount: 300 }),
      tx({ date: '2026-04-10', baseAmount: 300 }),
    ]
    const s = spendingSnapshot(txs, 'cat1', '2025-06-01', now)!
    expect(s.typical).toBe(100) // 600 / 6
  })

  it('computes trend as last 3 months vs prior 3', () => {
    const txs = [
      tx({ date: '2026-01-10', baseAmount: 100 }),
      tx({ date: '2026-02-10', baseAmount: 100 }),
      tx({ date: '2026-03-10', baseAmount: 100 }),
      tx({ date: '2026-04-10', baseAmount: 120 }),
      tx({ date: '2026-05-10', baseAmount: 120 }),
      tx({ date: '2026-06-10', baseAmount: 120 }),
    ]
    const s = spendingSnapshot(txs, 'cat1', '2025-06-01', now)!
    expect(s.trend).toBeCloseTo(0.2)
  })

  it('scopes to the category, or all expenses when categoryId is null; ignores income', () => {
    const txs = [
      tx({ date: '2026-06-10', baseAmount: 100, categoryId: 'groc' }),
      tx({ date: '2026-06-10', baseAmount: 50, categoryId: 'fun' }),
      tx({ date: '2026-06-10', baseAmount: 999, type: 'income', categoryId: 'salary' }),
    ]
    expect(spendingSnapshot(txs, 'groc', '2026-06-01', now)!.max).toBe(100)
    expect(spendingSnapshot(txs, null, '2026-06-01', now)!.max).toBe(150)
  })

  it('returns null with no history at all, or no expense spend in the window', () => {
    expect(spendingSnapshot([], 'cat1', '', now)).toBeNull()
    const incomeOnly = [tx({ date: '2026-06-10', type: 'income', baseAmount: 500 })]
    expect(spendingSnapshot(incomeOnly, null, '2026-06-10', now)).toBeNull()
  })
})

describe('friendlyBudget', () => {
  it('rounds coarser at larger magnitudes', () => {
    expect(friendlyBudget(1437.62)).toBe(1450) // nearest 50
    expect(friendlyBudget(437.62)).toBe(440) // nearest 10
    expect(friendlyBudget(63.2)).toBe(65) // nearest 5
    expect(friendlyBudget(12.4)).toBe(12) // nearest 1
    expect(friendlyBudget(0.3)).toBe(1) // never suggests 0
  })
})

describe('niceAxisMax', () => {
  it('rounds up along the 1/2/5/10 ladder, never clipping the input value', () => {
    expect(niceAxisMax(1450)).toBe(2000)
    expect(niceAxisMax(50)).toBe(50) // exact ladder value stays put
    expect(niceAxisMax(253.55)).toBe(500)
    expect(niceAxisMax(8)).toBe(10)
    expect(niceAxisMax(1)).toBe(1)
  })

  it('is always >= the input across a spread of values', () => {
    for (const v of [1, 4, 9, 12, 49, 51, 99, 101, 499, 999, 1001, 4999]) {
      expect(niceAxisMax(v)).toBeGreaterThanOrEqual(v)
    }
  })

  it('treats zero/negative as a degenerate axis of 1', () => {
    expect(niceAxisMax(0)).toBe(1)
    expect(niceAxisMax(-5)).toBe(1)
  })
})
