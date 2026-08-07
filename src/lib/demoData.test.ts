import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDemoDataset } from './demoData'

/** The dataset is generated relative to "today" — `startOfMonth(today − 25
 * months)` up to today — so the whole 26-month window slides forward every
 * day, taking with it which months land in whatever bucket a test compares,
 * and how much of the final (partial) month exists at all.
 *
 * The assertions below describe the generator's *shape*: a moderate savings
 * rate, a visible upward trend, a mix of over- and under-budget categories.
 * Left on the wall clock they were partly testing the calendar instead —
 * several of them genuinely flipped depending on the day the suite ran, which
 * is how a real regression once hid behind a green run and an unrelated change
 * later "broke" them. Pinning the clock makes every run evaluate the same
 * window, so a failure here means the generator changed.
 *
 * The date is not arbitrary: it was chosen so the assertions still bite. A
 * pinned clock can quietly neuter a test by freezing it on a day where even a
 * regression passes — picking the obvious "today" did exactly that, letting
 * the pre-fix +8%/yr creep sail through the trend check. On this date that
 * weaker creep fails it (last6/first6 = 0.92) while the current rate clears
 * it with room (1.32), every other assertion here holds with margin, and the
 * final month is only days old so the partial-month path stays covered.
 * Only `Date` is faked — timers are left real. */
const PINNED_NOW = new Date('2026-07-06T12:00:00Z')

describe('buildDemoDataset', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(PINNED_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is deterministic for the same currency and theme', () => {
    const a = buildDemoDataset('USD', 'sage')
    const b = buildDemoDataset('USD', 'sage')
    expect(a.transactions.length).toBe(b.transactions.length)
    expect(a.transactions.map((t) => t.baseAmount)).toEqual(b.transactions.map((t) => t.baseAmount))
    expect(a.categories.map((c) => c.name)).toEqual(b.categories.map((c) => c.name))
  })

  it('spans at least 25 months so year-over-year has real data both years', () => {
    const { openingBalanceDate, transactions } = buildDemoDataset('USD', 'sage')
    const start = new Date(openingBalanceDate)
    const monthsSpan =
      (new Date().getFullYear() - start.getFullYear()) * 12 + (new Date().getMonth() - start.getMonth())
    expect(monthsSpan).toBeGreaterThanOrEqual(25)
    expect(transactions.every((t) => t.date >= openingBalanceDate)).toBe(true)
  })

  it('every transaction references a real category id', () => {
    const { categories, transactions } = buildDemoDataset('USD', 'sage')
    const ids = new Set(categories.map((c) => c.id))
    expect(transactions.every((t) => ids.has(t.categoryId))).toBe(true)
  })

  it('leaves some expense categories unbudgeted for the rolling-average fallback', () => {
    const { categories, budgets } = buildDemoDataset('USD', 'sage')
    const budgetedIds = new Set(budgets.map((b) => b.categoryId))
    const unbudgetedExpense = categories.filter((c) => c.type === 'expense' && !budgetedIds.has(c.id))
    expect(unbudgetedExpense.length).toBeGreaterThan(0)
  })

  it('includes exactly one overall budget (categoryId null)', () => {
    const { budgets } = buildDemoDataset('USD', 'sage')
    expect(budgets.filter((b) => b.categoryId === null)).toHaveLength(1)
  })

  it('includes a second currency, with a locked baseRate on those transactions', () => {
    const { rates, transactions } = buildDemoDataset('USD', 'sage')
    expect(rates).toHaveLength(2)
    const foreign = transactions.filter((t) => t.currency !== 'USD')
    expect(foreign.length).toBeGreaterThan(0)
    for (const t of foreign) {
      expect(t.baseRate).not.toBe(1)
      expect(t.baseAmount).toBeCloseTo(t.amount * t.baseRate, 2)
    }
  })

  it('picks a secondary currency other than the base, even when base is EUR', () => {
    const { rates } = buildDemoDataset('EUR', 'sage')
    expect(rates.map((r) => r.currency)).toEqual(['EUR', 'GBP'])
  })

  it('tags carry an accurate usage count and last-used timestamp', () => {
    const { tags, transactions } = buildDemoDataset('USD', 'sage')
    for (const tag of tags) {
      const matching = transactions.filter((t) => t.tags.includes(tag.name))
      expect(tag.usageCount).toBe(matching.length)
      expect(tag.lastUsedAt).toBe(Math.max(...matching.map((t) => t.updatedAt)))
    }
  })

  it("categories' usageCount matches the actual number of transactions in them", () => {
    const { categories, transactions } = buildDemoDataset('USD', 'sage')
    for (const c of categories) {
      const matching = transactions.filter((t) => t.categoryId === c.id).length
      expect(c.usageCount).toBe(matching)
    }
  })

  // ---- Realism / feature-showcase properties (moderate-saver rebuild) ----

  /** Sum base-currency income and expense across all transactions. */
  function totals(transactions: ReturnType<typeof buildDemoDataset>['transactions']) {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      if (t.type === 'income') income += t.baseAmount
      else expense += t.baseAmount
    }
    return { income, expense }
  }

  /** Expense (or income) per calendar month for a category, keyed "YYYY-MM". */
  function monthlyByCategory(
    transactions: ReturnType<typeof buildDemoDataset>['transactions'],
    categoryId: string,
  ): Map<string, number> {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (t.categoryId !== categoryId) continue
      const k = t.date.slice(0, 7)
      m.set(k, (m.get(k) ?? 0) + t.baseAmount)
    }
    return m
  }

  it('portrays a moderate saver — overall savings rate is roughly 18–32%', () => {
    const { transactions } = buildDemoDataset('USD', 'sage')
    const { income, expense } = totals(transactions)
    const rate = (income - expense) / income
    expect(rate).toBeGreaterThan(0.18)
    expect(rate).toBeLessThan(0.32)
  })

  it('has at least one net-negative month, so the red savings-rate state can show', () => {
    const { transactions } = buildDemoDataset('USD', 'sage')
    const inc = new Map<string, number>()
    const exp = new Map<string, number>()
    for (const t of transactions) {
      const k = t.date.slice(0, 7)
      const bag = t.type === 'income' ? inc : exp
      bag.set(k, (bag.get(k) ?? 0) + t.baseAmount)
    }
    const negativeMonths = [...exp.keys()].filter((k) => (exp.get(k) ?? 0) > (inc.get(k) ?? 0))
    expect(negativeMonths.length).toBeGreaterThan(0)
  })

  it('populates notes on a meaningful share of transactions', () => {
    const { transactions } = buildDemoDataset('USD', 'sage')
    const withNote = transactions.filter((t) => t.note.trim() !== '').length
    expect(withNote / transactions.length).toBeGreaterThan(0.3)
  })

  it('has a balanced tag set: several on expenses AND several on income', () => {
    const { transactions } = buildDemoDataset('USD', 'sage')
    const expenseTags = new Set<string>()
    const incomeTags = new Set<string>()
    for (const t of transactions) {
      const bag = t.type === 'income' ? incomeTags : expenseTags
      for (const tag of t.tags) bag.add(tag)
    }
    expect(expenseTags.size).toBeGreaterThanOrEqual(4)
    expect(incomeTags.size).toBeGreaterThanOrEqual(3)
  })

  it('has an upward spend trend — Dining Out grows across the span (lifestyle creep)', () => {
    const { categories, transactions } = buildDemoDataset('USD', 'sage')
    const diningId = categories.find((c) => c.name === 'Dining Out')!.id
    const byMonth = [...monthlyByCategory(transactions, diningId).entries()].sort(([a], [b]) =>
      a < b ? -1 : 1,
    )
    // Compare the first 6 covered months to the last 6 — creep should lift the
    // recent window clearly above the early one despite the random daily draws.
    const first6 = byMonth.slice(0, 6).reduce((s, [, v]) => s + v, 0)
    const last6 = byMonth.slice(-6).reduce((s, [, v]) => s + v, 0)
    expect(last6).toBeGreaterThan(first6)
  })

  it('gives a compelling budget mix — some months over limit, at least one category always under', () => {
    const { budgets, transactions } = buildDemoDataset('USD', 'sage')
    const catBudgets = budgets.filter((b) => b.categoryId !== null)
    // Complete months only (drop the current, partial month).
    const currentKey = new Date().toISOString().slice(0, 7)

    let anyOver = false
    let anyAlwaysUnder = false
    for (const b of catBudgets) {
      const byMonth = monthlyByCategory(transactions, b.categoryId!)
      const complete = [...byMonth.entries()].filter(([k]) => k < currentKey)
      if (complete.length === 0) continue
      const overMonths = complete.filter(([, v]) => v > b.amount).length
      if (overMonths > 0) anyOver = true
      if (overMonths === 0) anyAlwaysUnder = true
    }
    expect(anyOver).toBe(true)
    expect(anyAlwaysUnder).toBe(true)
  })

  it('includes foreign-currency travel legs with a locked base rate', () => {
    const { transactions } = buildDemoDataset('USD', 'sage')
    const foreign = transactions.filter((t) => t.currency !== 'USD')
    expect(foreign.length).toBeGreaterThan(0)
    for (const t of foreign) {
      expect(t.baseRate).not.toBe(1)
      expect(t.baseAmount).toBeCloseTo(t.amount * t.baseRate, 2)
    }
  })
})
