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

/** Seasonal multiplier for utility bills — higher in summer (AC) and deep
 * winter (heating), lower in the mild shoulder months, so the Utilities trend
 * and the calendar heatmap show a believable summer/winter rhythm. */
function utilFactor(month: number): number {
  if (month === 5 || month === 6 || month === 7) return 1.35 // Jun–Aug
  if (month === 11 || month === 0 || month === 1) return 1.3 // Dec–Feb
  return 0.85
}

/** Small per-category note pools. A transaction picks one ~60% of the time
 * (the rest stay blank, as real logs do), so the Activity list and the
 * transaction-row secondary line actually demonstrate notes. */
const NOTES: Record<string, string[]> = {
  Groceries: ['Weekly shop', 'Costco run', 'Farmers market', 'Quick top-up'],
  'Dining Out': ['Lunch with coworkers', 'Dinner out', 'Friday takeout', 'Brunch'],
  Coffee: ['Morning latte', 'Cafe with a friend', 'Cold brew'],
  Transport: ['Gas', 'Rideshare', 'Train pass', 'Parking'],
  Entertainment: ['Movie night', 'Concert tickets', 'Game night'],
  Shopping: ['New shoes', 'Home goods', 'Clothes', 'Gadget'],
  'Health & Fitness': ['Yoga class', 'Pharmacy', 'Supplements'],
  'Personal Care': ['Haircut', 'Skincare', 'Barber'],
  'Gifts & Donations': ['Birthday gift', 'Charity donation'],
  Freelance: ['Client project', 'Consulting gig', 'Design work'],
  Gifts: ['Birthday gift', 'Cash gift'],
  'Other Income': ['Refund', 'Reimbursement', 'Cashback'],
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

// Budgets tuned against the generated spend to give the overview a genuine
// mix: Entertainment sits comfortably under every month; Coffee/Transport/
// Groceries/Dining hover and flip over/under month to month; Shopping runs
// chronically over. Rent/Utilities/Subscriptions/Health/Travel/Personal Care/
// Gifts stay unbudgeted (some intentionally, for the rolling-average fallback).
const EXPENSE_CATS: SeedCat[] = [
  { name: 'Groceries', icon: '🛒', type: 'expense', budget: 700 },
  { name: 'Dining Out', icon: '🍽️', type: 'expense', budget: 450 },
  { name: 'Coffee', icon: '☕', type: 'expense', budget: 60 },
  { name: 'Transport', icon: '🚗', type: 'expense', budget: 300 },
  { name: 'Rent', icon: '🏠', type: 'expense' },
  { name: 'Utilities', icon: '💡', type: 'expense' },
  { name: 'Subscriptions', icon: '📱', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', type: 'expense', budget: 400 },
  { name: 'Shopping', icon: '🛍️', type: 'expense', budget: 250 },
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
 * exercises every feature and graph state. Modeled as a *moderate saver*
 * (~25% of income): a fixed salary with a mid-history raise and a year-end
 * bonus; day-to-day spending that gently grows (lifestyle creep) and swings
 * with the seasons (summer/winter utilities, summer + holiday travel, a
 * December gifts/dining bump, a January gym spike); a big August vacation
 * that pushes that month net-negative (so the wealth line dips and the
 * savings-rate stat goes red); notes on most transactions; a balanced tag
 * set across both income and expense; and a handful of foreign-currency
 * legs to show off locked-in exchange rates. All ending today, so Week/
 * Month/Year/All views and year-over-year comparisons all have real data.
 * Regenerated fresh each time Demo Mode is turned on (same shape every time,
 * since the PRNG is fixed-seed).
 */
export function buildDemoDataset(baseCurrency: string, appTheme: AppTheme): DemoDataset {
  const rand = mulberry32(20260711)
  const chance = (p: number) => rand() < p
  const range = (min: number, max: number) => min + rand() * (max - min)
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)]

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

  // A second currency shows off the locked-in exchange-rate behavior on the
  // vacation legs booked abroad.
  const secondaryCurrency = baseCurrency === 'EUR' ? 'GBP' : 'EUR'
  const secondaryRate = secondaryCurrency === 'EUR' ? 1.08 : 1.27

  const today = new Date()
  const start = startOfMonth(addMonths(today, -25))
  const openingBalanceDate = toISO(start)

  const transactions: Transaction[] = []
  const tagUsage = new Map<string, { count: number; lastUsedAt: number }>()
  let seq = 0

  /** ~60% of transactions get a category-appropriate note; the rest are blank. */
  function autoNote(name: string): string {
    const pool = NOTES[name]
    if (!pool) return ''
    return chance(0.6) ? pick(pool) : ''
  }

  function add(
    name: string,
    type: TxType,
    amount: number,
    dateIso: string,
    opts?: { currency?: string; baseRate?: number; tags?: string[]; note?: string },
  ) {
    const currency = opts?.currency ?? baseCurrency
    const baseRate = currency === baseCurrency ? 1 : opts?.baseRate ?? 1
    const tags = opts?.tags ?? []
    const note = opts?.note ?? autoNote(name)
    const ts = parseISO(dateIso).getTime() + seq++
    // Round the amount first, then derive baseAmount from that rounded figure,
    // so `baseAmount === round2(amount * baseRate)` holds exactly (matching how
    // the real repo locks in a converted amount from the stored amount).
    const roundedAmount = round2(amount)
    transactions.push({
      id: uid(),
      type,
      amount: roundedAmount,
      currency,
      categoryId: catId(name),
      note,
      tags,
      date: dateIso,
      createdAt: ts,
      updatedAt: ts,
      baseAmount: round2(roundedAmount * baseRate),
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
    const month = cursor.getMonth()
    // Whole months since the demo's start — drives the raise and lifestyle creep.
    const me = (cursor.getFullYear() - start.getFullYear()) * 12 + (month - start.getMonth())
    // Gentle spending growth over the whole span (~+8%/yr) so category MoM/YoY
    // deltas and the budget-form trend readout show real movement, not ~0%.
    const grow = Math.pow(1.08, me / 12)
    const salary = me >= 12 ? 5200 : 4800 // a raise at the one-year mark

    // Monthly fixed items.
    if (day === 1) {
      add('Salary', 'income', salary, iso, { note: 'Monthly paycheck' })
      add('Rent', 'expense', 1450, iso, { note: 'Monthly rent' })
    }
    // Year-end bonus each December — a second recurring income tag + a December
    // income spike that keeps the holiday month positive despite the spending.
    if (month === 11 && day === 1) {
      add('Salary', 'income', round2(salary * 0.5), iso, { note: 'Year-end bonus', tags: ['bonus'] })
    }
    if (day === 3) add('Utilities', 'expense', range(80, 150) * utilFactor(month), iso, { note: 'Electric + water' })
    if (day === 4) add('Health & Fitness', 'expense', 45, iso, { note: 'Gym membership', tags: ['health'] })
    if (day === 5) add('Subscriptions', 'expense', range(38, 52) * grow, iso, { note: 'Streaming + music', tags: ['subscription'] })
    if (day === 7 && chance(0.5)) add('Freelance', 'income', range(200, 800), iso, { tags: ['side-hustle'] })
    if (day === 15 && month % 3 === 0) add('Investments', 'income', range(50, 300), iso, { note: 'Dividend payout', tags: ['dividend'] })

    // Day-to-day spending (grows with `grow`; probabilities tuned so total
    // spend lands around ~75% of income — a moderate saver).
    if (dow === 6) add('Groceries', 'expense', range(75, 160) * grow, iso)
    if (dow === 2 && chance(0.55)) add('Groceries', 'expense', range(30, 55) * grow, iso, { note: 'Quick top-up' })
    if (dow !== 0 && dow !== 6 && chance(0.45)) add('Coffee', 'expense', range(4, 7) * grow, iso)

    if (chance(0.24)) {
      const weekday = dow >= 1 && dow <= 5
      let tags: string[] = []
      if (weekday && chance(0.4)) tags = ['work-lunch']
      else if (!weekday && chance(0.3)) tags = ['date-night']
      add('Dining Out', 'expense', range(18, 85) * grow, iso, { tags })
    }
    if (chance(0.18)) add('Transport', 'expense', range(15, 70), iso)
    if (chance(0.1)) add('Entertainment', 'expense', range(15, 60), iso)
    if (chance(0.09)) add('Shopping', 'expense', range(25, 180), iso, { tags: chance(0.2) ? ['family'] : [] })
    if (chance(0.02)) add('Health & Fitness', 'expense', range(20, 60), iso, { tags: ['health'] })
    if (chance(0.035)) add('Personal Care', 'expense', range(25, 80), iso)
    if (chance(0.01)) add('Gifts & Donations', 'expense', range(20, 130), iso, { tags: chance(0.3) ? ['family'] : [] })
    if (chance(0.006)) add('Gifts', 'income', range(50, 200), iso)
    if (chance(0.005)) add('Other Income', 'income', range(20, 100), iso, { tags: ['refund'] })

    // January gym spike (New-Year resolutions).
    if (month === 0 && day === 10) add('Health & Fitness', 'expense', range(80, 160), iso, { note: 'New-year gear', tags: ['health'] })

    // December holiday bumps — gifts, shopping, a couple of festive dinners.
    if (month === 11 && day === 18) add('Gifts & Donations', 'expense', range(150, 300), iso, { note: 'Holiday gifts', tags: ['holidays', 'family'] })
    if (month === 11 && day === 15) add('Shopping', 'expense', range(120, 300), iso, { note: 'Holiday shopping', tags: ['holidays'] })
    if (month === 11 && (day === 12 || day === 22)) add('Dining Out', 'expense', range(60, 120), iso, { note: 'Holiday dinner', tags: ['holidays'] })

    // Seasonal travel. Summer weekend getaways (Jun–Jul), alternating currency.
    if ((month === 5 || month === 6) && chance(0.06)) {
      tripIndex++
      const isForeign = tripIndex % 2 === 0
      add('Travel', 'expense', range(250, 600), iso, {
        note: 'Weekend trip',
        tags: ['vacation'],
        ...(isForeign ? { currency: secondaryCurrency, baseRate: secondaryRate } : {}),
      })
    }
    // The big August vacation — always happens, in three legs, with the hotel
    // booked abroad (locked-rate showcase). Large enough that August runs
    // net-negative: a visible wealth-line dip + a red savings-rate month.
    if (month === 7 && day === 12) {
      add('Travel', 'expense', range(700, 1000), iso, { note: 'Flights', tags: ['vacation'] })
      add('Travel', 'expense', range(1100, 1500), iso, { note: 'Hotel', tags: ['vacation'], currency: secondaryCurrency, baseRate: secondaryRate })
      add('Travel', 'expense', range(300, 600), iso, { note: 'Activities', tags: ['vacation'] })
    }
    // A winter holiday trip — offset by the December bonus, so December still
    // reads positive (contrast with the deep-red August).
    if (month === 11 && day === 27 && chance(0.7)) {
      add('Travel', 'expense', range(500, 900), iso, { note: 'Holiday travel', tags: ['vacation', 'holidays'] })
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
  budgets.push({ id: uid(), categoryId: null, period: 'monthly', amount: 4200, currency: baseCurrency })

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
