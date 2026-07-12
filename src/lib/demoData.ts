import type { Budget, Category, Rate, Tag, Transaction, TxType } from '@/db/types'
import { addDays, addMonths, parseISO, startOfMonth, toISO } from './date'
import { uid } from './id'
import { categoryPalette, type AppTheme } from './palette'

/** Deterministic PRNG (mulberry32) — same seed every call, so Demo Mode looks
 * like the same clean showcase every time it's turned on, not a dice roll. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface DemoDataset {
  categories: Category[]
  tags: Tag[]
  budgets: Budget[]
  rates: Rate[]
  transactions: Transaction[]
  openingBalance: number
  openingBalanceDate: string
}

interface SeedCat {
  name: string
  icon: string
  type: TxType
  /** Monthly budget in base currency — omitted categories stay unbudgeted,
   * so BudgetPanel's rolling-average fallback has something real to show. */
  budget?: number
}

const EXPENSE_CATS: SeedCat[] = [
  { name: 'Groceries', icon: '🛒', type: 'expense', budget: 500 },
  { name: 'Dining Out', icon: '🍽️', type: 'expense', budget: 250 },
  { name: 'Coffee', icon: '☕', type: 'expense', budget: 60 },
  { name: 'Transport', icon: '🚗', type: 'expense', budget: 200 },
  { name: 'Rent', icon: '🏠', type: 'expense' },
  { name: 'Utilities', icon: '💡', type: 'expense' },
  { name: 'Subscriptions', icon: '📱', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', type: 'expense', budget: 120 },
  { name: 'Shopping', icon: '🛍️', type: 'expense', budget: 200 },
  { name: 'Health & Fitness', icon: '🏋️', type: 'expense' },
  { name: 'Travel', icon: '✈️', type: 'expense' },
  { name: 'Personal Care', icon: '💇', type: 'expense' },
  { name: 'Gifts & Donations', icon: '🎁', type: 'expense' },
]

const INCOME_CATS: SeedCat[] = [
  { name: 'Salary', icon: '💵', type: 'income' },
  { name: 'Freelance', icon: '💻', type: 'income' },
  { name: 'Investments', icon: '📈', type: 'income' },
  { name: 'Gifts', icon: '🎁', type: 'income' },
  { name: 'Other Income', icon: '➕', type: 'income' },
]

/**
 * Builds a ~26-month, realistic-but-deterministic sample dataset that
 * exercises every feature: recurring + one-off transactions across a mix of
 * budgeted and unbudgeted categories, tags, a few foreign-currency
 * transactions, and an opening balance — all ending today, so Week/Month/
 * Year/All views and year-over-year comparisons all have real data to show.
 * Regenerated fresh each time Demo Mode is turned on (same shape every time,
 * since the PRNG is fixed-seed).
 */
export function buildDemoDataset(baseCurrency: string, appTheme: AppTheme): DemoDataset {
  const rand = mulberry32(20260711)
  const chance = (p: number) => rand() < p
  const range = (min: number, max: number) => min + rand() * (max - min)

  const palette = categoryPalette(appTheme)
  const allCats = [...EXPENSE_CATS, ...INCOME_CATS]
  const categories: Category[] = allCats.map((c, i) => ({
    id: uid(),
    name: c.name,
    icon: c.icon,
    color: palette[i % palette.length],
    type: c.type,
    sortOrder: i,
    usageCount: 0,
    isArchived: 0,
  }))
  const catId = (name: string) => categories.find((c) => c.name === name)!.id

  // A second currency shows off the locked-in exchange-rate behavior on a
  // handful of travel transactions.
  const secondaryCurrency = baseCurrency === 'EUR' ? 'GBP' : 'EUR'
  const secondaryRate = secondaryCurrency === 'EUR' ? 1.08 : 1.27

  const today = new Date()
  const start = startOfMonth(addMonths(today, -25))
  const openingBalanceDate = toISO(start)

  const transactions: Transaction[] = []
  const tagUsage = new Map<string, { count: number; lastUsedAt: number }>()
  let seq = 0

  function add(
    name: string,
    type: TxType,
    amount: number,
    dateIso: string,
    opts?: { currency?: string; baseRate?: number; tags?: string[] },
  ) {
    const currency = opts?.currency ?? baseCurrency
    const baseRate = currency === baseCurrency ? 1 : opts?.baseRate ?? 1
    const tags = opts?.tags ?? []
    const ts = parseISO(dateIso).getTime() + seq++
    transactions.push({
      id: uid(),
      type,
      amount: round2(amount),
      currency,
      categoryId: catId(name),
      note: '',
      tags,
      date: dateIso,
      createdAt: ts,
      updatedAt: ts,
      baseAmount: round2(amount * baseRate),
      baseRate,
    })
    for (const t of tags) {
      const key = t.toLowerCase()
      const cur = tagUsage.get(key) ?? { count: 0, lastUsedAt: 0 }
      cur.count++
      cur.lastUsedAt = Math.max(cur.lastUsedAt, ts)
      tagUsage.set(key, cur)
    }
  }

  let cursor = new Date(start)
  let tripIndex = 0
  while (cursor <= today) {
    const iso = toISO(cursor)
    const day = cursor.getDate()
    const dow = cursor.getDay()

    // Monthly fixed items.
    if (day === 1) {
      add('Salary', 'income', range(4600, 5000), iso)
      add('Rent', 'expense', 1450, iso)
    }
    if (day === 3) add('Utilities', 'expense', range(80, 150), iso)
    if (day === 5) add('Subscriptions', 'expense', range(38, 52), iso)
    if (day === 7 && chance(0.5)) add('Freelance', 'income', range(200, 800), iso, { tags: ['side-hustle'] })
    if (day === 15 && cursor.getMonth() % 3 === 0) add('Investments', 'income', range(50, 300), iso)

    // Day-to-day spending.
    if (dow === 6) add('Groceries', 'expense', range(60, 140), iso)
    if (dow !== 0 && dow !== 6 && chance(0.3)) add('Coffee', 'expense', range(4, 7), iso)
    if (chance(0.12)) {
      add('Dining Out', 'expense', range(15, 70), iso, chance(0.2) ? { tags: ['date-night'] } : undefined)
    }
    if (chance(0.1)) add('Transport', 'expense', range(15, 60), iso)
    if (chance(0.05)) add('Entertainment', 'expense', range(12, 45), iso)
    if (chance(0.04)) add('Shopping', 'expense', range(20, 150), iso)
    if (chance(0.02)) add('Health & Fitness', 'expense', range(30, 90), iso)
    if (chance(0.02)) add('Personal Care', 'expense', range(25, 80), iso)
    if (chance(0.008)) add('Gifts & Donations', 'expense', range(20, 130), iso)
    if (chance(0.005)) add('Gifts', 'income', range(50, 200), iso)
    if (chance(0.004)) add('Other Income', 'income', range(20, 100), iso)

    // A bigger gift-giving spike each holiday season.
    if (cursor.getMonth() === 11 && day === 20) {
      add('Gifts & Donations', 'expense', range(80, 180), iso, { tags: ['holidays'] })
    }

    // A handful of trips scattered across the whole span, alternating
    // currency so multi-currency shows up more than once.
    if (chance(0.009)) {
      tripIndex++
      const isForeign = tripIndex % 2 === 0
      add('Travel', 'expense', range(300, 1200), iso, {
        tags: ['vacation'],
        ...(isForeign ? { currency: secondaryCurrency, baseRate: secondaryRate } : {}),
      })
    }

    cursor = addDays(cursor, 1)
  }

  for (const c of categories) {
    c.usageCount = transactions.filter((t) => t.categoryId === c.id).length
  }

  const tags: Tag[] = Array.from(tagUsage.entries()).map(([name, u]) => ({
    id: uid(),
    name,
    usageCount: u.count,
    lastUsedAt: u.lastUsedAt,
  }))

  const budgets: Budget[] = []
  for (const c of EXPENSE_CATS) {
    if (c.budget != null) {
      budgets.push({
        id: uid(),
        categoryId: catId(c.name),
        period: 'monthly',
        amount: c.budget,
        currency: baseCurrency,
      })
    }
  }
  budgets.push({ id: uid(), categoryId: null, period: 'monthly', amount: 3200, currency: baseCurrency })

  const rates: Rate[] = [
    { currency: baseCurrency, rate: 1, updatedAt: Date.now() },
    { currency: secondaryCurrency, rate: secondaryRate, updatedAt: Date.now() },
  ]

  return {
    categories,
    tags,
    budgets,
    rates,
    transactions,
    openingBalance: 4200,
    openingBalanceDate,
  }
}
