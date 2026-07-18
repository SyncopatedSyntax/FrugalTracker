import type { Transaction } from '@/db/types'
import {
  addMonths,
  daysInMonth,
  endOfMonth,
  monthShort,
  parseISO,
  shiftYears,
  startOfMonth,
  startOfWeek,
  toISO,
} from './date'

export type Timeframe = 'week' | 'month' | 'year'

export interface Range {
  startISO: string
  endISO: string
}

/** Week/Month/Year-to-date range, ending today. */
export function periodRange(timeframe: Timeframe, now: Date, firstDayOfWeek: 0 | 1): Range {
  const endISO = toISO(now)
  if (timeframe === 'week') {
    return { startISO: toISO(startOfWeek(now, firstDayOfWeek)), endISO }
  }
  if (timeframe === 'month') {
    return { startISO: toISO(startOfMonth(now)), endISO }
  }
  return { startISO: `${now.getFullYear()}-01-01`, endISO }
}

/**
 * Scale a monthly amount (a budget, or a monthly average) to match how much
 * of the period has elapsed, so WTD/MTD/YTD all read on the same footing as
 * a monthly figure would. Elapsed-month fractions use the current month's
 * day-of-month / day-count, consistent between the MTD and YTD formulas.
 */
export function prorateMonthly(
  monthlyAmount: number,
  timeframe: Timeframe,
  now: Date,
  firstDayOfWeek: 0 | 1,
): number {
  const dim = daysInMonth(now)
  const dayFraction = now.getDate() / dim
  if (timeframe === 'week') {
    const start = startOfWeek(now, firstDayOfWeek)
    const elapsedDays = Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1
    return monthlyAmount * (elapsedDays / dim)
  }
  if (timeframe === 'month') {
    return monthlyAmount * dayFraction
  }
  const fullMonthsElapsed = now.getMonth() // months before the current one
  return monthlyAmount * (fullMonthsElapsed + dayFraction)
}

/** Shift both boundaries of a range back exactly one year, preserving day-of-month. */
export function sameRangeLastYear(range: Range): Range {
  return {
    startISO: toISO(shiftYears(parseISO(range.startISO), -1)),
    endISO: toISO(shiftYears(parseISO(range.endISO), -1)),
  }
}

/**
 * Average monthly expense spend (overall, or for one category) over the
 * trailing complete calendar months — the current in-progress month is
 * excluded so it never skews the average. Capped to however much
 * transaction history actually exists (a 3-month-old install averages over
 * 3 months, not 12). Returns 0 when there's no matching history.
 */
export function rollingMonthlyAverage(
  txs: Transaction[],
  categoryId: string | null,
  now: Date,
): number {
  const windowEnd = endOfMonth(addMonths(now, -1))
  const earliestWanted = startOfMonth(addMonths(now, -12))

  const matches = txs.filter(
    (t) => t.type === 'expense' && (categoryId === null || t.categoryId === categoryId),
  )
  if (matches.length === 0) return 0

  const earliestTxDate = matches.reduce((m, t) => (t.date < m ? t.date : m), matches[0].date)
  const windowStart = new Date(
    Math.max(earliestWanted.getTime(), parseISO(earliestTxDate).getTime()),
  )
  if (windowStart > windowEnd) return 0

  const startISO = toISO(startOfMonth(windowStart))
  const endISO = toISO(windowEnd)
  const inWindow = matches.filter((t) => t.date >= startISO && t.date <= endISO)
  if (inWindow.length === 0) return 0

  const total = inWindow.reduce((sum, t) => sum + t.baseAmount, 0)
  const monthsSpanned =
    (windowEnd.getFullYear() - windowStart.getFullYear()) * 12 +
    (windowEnd.getMonth() - windowStart.getMonth()) +
    1
  return total / Math.max(1, monthsSpanned)
}

/** Expense spend per calendar month for one budget (a category, or the whole
 * account when `categoryId` is null), over the trailing `months` months
 * ending with `endAnchor`'s month. Each month carries the same `monthlyLimit`
 * so a history view can draw spent-vs-limit bars and flag overspends. */
export interface BudgetMonth {
  /** "YYYY-MM" */
  key: string
  /** e.g. "Jul 25" */
  label: string
  spent: number
  limit: number
  over: boolean
}

export function budgetHistory(
  txs: Transaction[],
  categoryId: string | null,
  monthlyLimit: number,
  months: number,
  endAnchor: Date = new Date(),
): BudgetMonth[] {
  const byKey = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    if (categoryId !== null && t.categoryId !== categoryId) continue
    const key = t.date.slice(0, 7)
    byKey.set(key, (byKey.get(key) ?? 0) + t.baseAmount)
  }
  const out: BudgetMonth[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(endAnchor, -i)
    const key = toISO(m).slice(0, 7)
    const spent = byKey.get(key) ?? 0
    out.push({
      key,
      label: `${monthShort(m.getMonth())} ${String(m.getFullYear()).slice(2)}`,
      spent,
      limit: monthlyLimit,
      over: spent > monthlyLimit,
    })
  }
  return out
}

/** Cumulative year-to-date pace for one budget: how much you'd be *allowed*
 * to have spent by now (whole months elapsed this calendar year × the monthly
 * limit) versus what you actually spent, so a surplus in one month offsets an
 * overspend in another. `net > 0` = under budget for the year so far (ahead);
 * `net < 0` = over (behind). The current month counts as a full month —
 * matching how the monthly limit is granted at the start of each month. */
export interface YtdPace {
  /** Whole months of this year elapsed, current month included (Jan = 1). */
  monthsElapsed: number
  /** monthsElapsed × monthlyLimit. */
  budgeted: number
  /** Cumulative expense this calendar year for the budget's scope. */
  spent: number
  /** budgeted − spent: positive = ahead (under), negative = behind (over). */
  net: number
}

export function budgetYtdPace(
  txs: Transaction[],
  categoryId: string | null,
  monthlyLimit: number,
  now: Date = new Date(),
): YtdPace {
  const year = now.getFullYear()
  const monthsElapsed = now.getMonth() + 1
  const budgeted = monthsElapsed * monthlyLimit
  let spent = 0
  for (const t of txs) {
    if (t.type !== 'expense') continue
    if (categoryId !== null && t.categoryId !== categoryId) continue
    if (Number(t.date.slice(0, 4)) !== year) continue
    spent += t.baseAmount
  }
  return { monthsElapsed, budgeted, spent, net: budgeted - spent }
}

/** Sum of transactions of a given type (optionally scoped to a category) in a range, in base currency. */
export function sumInRange(
  txs: Transaction[],
  range: Range,
  type: Transaction['type'],
  categoryId: string | null,
): number {
  let total = 0
  for (const t of txs) {
    if (t.type !== type) continue
    if (categoryId !== null && t.categoryId !== categoryId) continue
    if (t.date < range.startISO || t.date > range.endISO) continue
    total += t.baseAmount
  }
  return total
}
