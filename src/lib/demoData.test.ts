import { describe, expect, it } from 'vitest'
import { buildDemoDataset } from './demoData'

describe('buildDemoDataset', () => {
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
})
