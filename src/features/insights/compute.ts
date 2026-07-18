import type { Category, Transaction, TxType } from '@/db/types'
import type { Bucket } from './period'
import { addMonths, monthShort, toISO } from '@/lib/date'

/** Signed value in base currency, using each transaction's locked-in
 * baseAmount (not a live conversion) — see Transaction.baseAmount. */
export function signedBase(t: Transaction): number {
  return t.type === 'income' ? t.baseAmount : -t.baseAmount
}

export function sumFlow(txs: Transaction[], flow: TxType): number {
  let s = 0
  for (const t of txs) if (t.type === flow) s += t.baseAmount
  return s
}

export function netFlow(txs: Transaction[]): number {
  return txs.reduce((s, t) => s + signedBase(t), 0)
}

export interface Slice {
  key: string
  name: string
  color: string
  icon?: string
  value: number
  count: number
}

export function categoryBreakdown(
  txs: Transaction[],
  flow: TxType,
  categoryMap: Map<string, Category>,
): Slice[] {
  const agg = new Map<string, { value: number; count: number }>()
  for (const t of txs) {
    if (t.type !== flow) continue
    const e = agg.get(t.categoryId) ?? { value: 0, count: 0 }
    e.value += t.baseAmount
    e.count++
    agg.set(t.categoryId, e)
  }
  return [...agg.entries()]
    .map(([id, { value, count }]) => {
      const c = categoryMap.get(id)
      return {
        key: id,
        name: c?.name ?? 'Uncategorized',
        color: c?.color ?? '#64748b',
        icon: c?.icon ?? '❓',
        value,
        count,
      }
    })
    .sort((a, b) => b.value - a.value)
}

/** Tags have no stored color (unlike categories), so each is colored by its
 * rank in the current theme's category palette — `palette` should be
 * `categoryPalette(settings.appTheme)` from the caller. */
export function labelBreakdown(
  txs: Transaction[],
  flow: TxType,
  palette: readonly string[],
): Slice[] {
  const agg = new Map<string, { value: number; count: number; display: string }>()
  for (const t of txs) {
    if (t.type !== flow) continue
    for (const tag of t.tags) {
      const key = tag.toLowerCase()
      const e = agg.get(key) ?? { value: 0, count: 0, display: tag }
      e.value += t.baseAmount
      e.count++
      agg.set(key, e)
    }
  }
  return [...agg.entries()]
    .map(([key, { value, count, display }]) => ({ key, name: display, value, count }))
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: palette[i % palette.length] }))
}

const byDate = (a: Transaction, b: Transaction) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/** Running net-worth balance at the end of each bucket, in base currency. */
export function balanceSeries(
  allTxs: Transaction[],
  buckets: Bucket[],
  opening: number,
  openingDateISO: string,
): number[] {
  const from =
    openingDateISO || allTxs.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31')
  const txs = allTxs.filter((t) => t.date >= from).sort(byDate)
  const out: number[] = []
  let acc = opening
  let i = 0
  for (const b of buckets) {
    while (i < txs.length && txs[i].date <= b.endISO) {
      acc += signedBase(txs[i])
      i++
    }
    out.push(acc)
  }
  return out
}

export interface CashflowBuckets {
  income: number[]
  expense: number[]
  /** income − expense *within that bucket* — not a running total. */
  net: number[]
}

/** Per-bucket (not cumulative) income, expense, and net, in base currency. */
export function cashflowByBucket(periodTxs: Transaction[], buckets: Bucket[]): CashflowBuckets {
  const txs = periodTxs.slice().sort(byDate)
  const income: number[] = []
  const expense: number[] = []
  const net: number[] = []
  let i = 0
  for (const b of buckets) {
    let inc = 0
    let exp = 0
    while (i < txs.length && txs[i].date <= b.endISO) {
      if (txs[i].type === 'income') inc += txs[i].baseAmount
      else exp += txs[i].baseAmount
      i++
    }
    income.push(inc)
    expense.push(exp)
    net.push(inc - exp)
  }
  return { income, expense, net }
}

export interface MonthPoint {
  /** "YYYY-MM" */
  key: string
  /** e.g. "Jul 25" — month + 2-digit year, unambiguous across a year boundary. */
  label: string
  value: number
  count: number
}

/** Per-calendar-month totals for one category over the trailing `months`
 * months (oldest → newest), ending with the month of `endAnchor`. Sums
 * locked-in `baseAmount`s of that category's own flow direction implicitly —
 * a category only ever holds transactions of its own type, so no flow filter
 * is needed beyond the categoryId. Months with no activity are explicit
 * zero points, so a trend chart shows gaps honestly instead of skipping. */
export function monthlySeriesFor(
  txs: Transaction[],
  categoryId: string,
  months: number,
  endAnchor: Date = new Date(),
): MonthPoint[] {
  const out: MonthPoint[] = []
  const byKey = new Map<string, { value: number; count: number }>()
  for (const t of txs) {
    if (t.categoryId !== categoryId) continue
    const key = t.date.slice(0, 7)
    const e = byKey.get(key) ?? { value: 0, count: 0 }
    e.value += t.baseAmount
    e.count++
    byKey.set(key, e)
  }
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(endAnchor, -i)
    const key = toISO(m).slice(0, 7)
    const e = byKey.get(key)
    out.push({
      key,
      label: `${monthShort(m.getMonth())} ${String(m.getFullYear()).slice(2)}`,
      value: e?.value ?? 0,
      count: e?.count ?? 0,
    })
  }
  return out
}

/** Fractional change from `prev` to `cur` (0.14 = +14%), or null when there
 * is no usable baseline (prev ≤ 0) — a delta against nothing/negative income
 * is noise, not signal, and should render as "—". */
export function deltaVs(prev: number, cur: number): number | null {
  if (prev <= 0) return null
  return (cur - prev) / prev
}

/** Fraction of income kept (0.25 = saved 25% of what came in) for the viewed
 * period, or null when there was no income to measure against — a savings
 * rate over zero income is undefined, not "0%", and should render as "—".
 * Can go negative when expenses exceed income (spent down savings). Both
 * arguments are positive-magnitude sums (see `sumFlow`). */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null
  return (income - expense) / income
}

export interface DayTotal {
  /** 1-based day of month. */
  day: number
  /** "YYYY-MM-DD" for this cell. */
  iso: string
  /** Expense magnitude in base currency (what the heatmap shades by). */
  expense: number
  income: number
  count: number
}

/** One entry per calendar day of `monthAnchor`'s month (day 1 → last),
 * summing each day's locked-in base amounts. Transactions outside that month
 * are ignored, so the caller can pass a slightly wider fetch without
 * polluting the grid. Drives the calendar heatmap. */
export function dailyTotals(txs: Transaction[], monthAnchor: Date): DayTotal[] {
  const year = monthAnchor.getFullYear()
  const month = monthAnchor.getMonth()
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const days = new Date(year, month + 1, 0).getDate()
  const out: DayTotal[] = []
  for (let d = 1; d <= days; d++) {
    out.push({
      day: d,
      iso: `${prefix}-${String(d).padStart(2, '0')}`,
      expense: 0,
      income: 0,
      count: 0,
    })
  }
  for (const t of txs) {
    if (t.date.slice(0, 7) !== prefix) continue
    const d = Number(t.date.slice(8, 10))
    const cell = out[d - 1]
    if (!cell) continue
    if (t.type === 'expense') cell.expense += t.baseAmount
    else cell.income += t.baseAmount
    cell.count++
  }
  return out
}

/** Index of the last bucket that has already started (<= today); -1 if none. */
export function lastStartedIndex(buckets: Bucket[], todayISO: string): number {
  let idx = -1
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].startISO <= todayISO) idx = i
  }
  return idx
}

/** Earliest transaction date, or '' when there are none. */
export function earliestDate(txs: Transaction[]): string {
  if (txs.length === 0) return ''
  return txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date)
}
