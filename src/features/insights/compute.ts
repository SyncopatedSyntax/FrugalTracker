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
  /** Full total — every transaction carrying this key, counted whole. For
   * labels a multi-tag transaction contributes its whole amount to each of its
   * tags, so label values deliberately sum to more than the period total; this
   * is the figure that matches the filtered transactions list. */
  value: number
  /** Portion of the period total this slice is responsible for, splitting a
   * multi-tag transaction evenly across its tags, so shares (together with the
   * untagged slice) sum to exactly the flow's period total — this is what the
   * donut draws and what the row percentages are derived from. Equals `value`
   * for categories, where each transaction has exactly one. */
  share: number
  count: number
}

/** Slate grey, used for slices that stand for an absence rather than a real
 * choice — a deleted category, or spend carrying no tags at all. Deliberately
 * outside every theme's category palette so it never collides with one. */
const NEUTRAL = '#64748b'

/** Key of the synthetic "no tags at all" slice on the Labels breakdown. Not a
 * real tag, so it can't collide with one (tag keys are lowercased user text). */
export const UNTAGGED_KEY = '__untagged__'

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
        color: c?.color ?? NEUTRAL,
        icon: c?.icon ?? '❓',
        value,
        share: value,
        count,
      }
    })
    .sort((a, b) => b.value - a.value)
}

/** Breakdown of one flow's spend by tag, plus a synthetic `Untagged` slice for
 * the transactions carrying none — without which the ring would silently hide
 * most of the period (tags are optional, and in practice most spend has none).
 *
 * Because a transaction can carry *several* tags, each slice reports two
 * different numbers (see `Slice`): `value` counts a transaction whole under
 * every one of its tags — the figure that matches the transactions list — while
 * `share` splits it evenly across them. Summing `value` would double-count the
 * overlap, so it's `share` that reconciles: shares plus the untagged slice come
 * to exactly `sumFlow(txs, flow)`. `count` stays whole (a fractional
 * transaction count is meaningless), so counts likewise don't sum to the number
 * of tagged transactions.
 *
 * Pass `categoryId` to narrow to a single category — "of my #vacation spend,
 * how much was Travel?" — which narrows the untagged residual to match.
 *
 * Tags have no stored color (unlike categories), so each is colored by its rank
 * in the current theme's category palette — `palette` should be
 * `categoryPalette(settings.appTheme)` from the caller. */
export function labelBreakdown(
  txs: Transaction[],
  flow: TxType,
  palette: readonly string[],
  categoryId?: string | null,
): Slice[] {
  const agg = new Map<string, { value: number; share: number; count: number; display: string }>()
  let untagged = 0
  let untaggedCount = 0
  for (const t of txs) {
    if (t.type !== flow) continue
    if (categoryId && t.categoryId !== categoryId) continue
    if (t.tags.length === 0) {
      untagged += t.baseAmount
      untaggedCount++
      continue
    }
    const split = t.baseAmount / t.tags.length
    for (const tag of t.tags) {
      const key = tag.toLowerCase()
      const e = agg.get(key) ?? { value: 0, share: 0, count: 0, display: tag }
      e.value += t.baseAmount
      e.share += split
      e.count++
      agg.set(key, e)
    }
  }
  // Ranked by share, not value: the donut draws slices in array order, so
  // ordering by the full (overlapping) totals could put a smaller arc before a
  // larger one and make the ring look broken.
  const slices: Slice[] = [...agg.entries()]
    .map(([key, { value, share, count, display }]) => ({ key, name: display, value, share, count }))
    .sort((a, b) => b.share - a.share)
    .map((s, i) => ({ ...s, color: palette[i % palette.length] }))

  // Pinned last rather than sorted in by size: it's the residual left over, not
  // a finding competing with the real tags, and it usually dwarfs all of them.
  if (untagged > 0) {
    slices.push({
      key: UNTAGGED_KEY,
      name: 'Untagged',
      color: NEUTRAL,
      value: untagged,
      share: untagged,
      count: untaggedCount,
    })
  }
  return slices
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

/** A robust colour-scale ceiling for the calendar heatmap: the ~92nd
 * percentile of non-zero daily expense across the visible range. A handful of
 * outlier days — the rent-on-the-1st, a vacation — would otherwise set the
 * scale so high that every ordinary day collapses into the same faint shade;
 * clamping to a high percentile instead means the top ~8% of days read as
 * fully saturated while everyday spending spreads across the rest of the ramp.
 * Falls back to the max when there are too few days to take a stable
 * percentile (a sparse month), where percentile ≈ max anyway. */
export function heatCeiling(dailyExpenses: number[]): number {
  const positive = dailyExpenses.filter((v) => v > 0).sort((a, b) => a - b)
  if (positive.length === 0) return 0
  if (positive.length < 8) return positive[positive.length - 1]
  const idx = Math.floor(0.92 * (positive.length - 1))
  return positive[idx]
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
