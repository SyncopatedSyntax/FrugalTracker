import type { Category, Transaction, TxType } from '@/db/types'
import { toBase, type RateMap } from '@/lib/convert'
import { CATEGORY_PALETTE } from '@/lib/palette'
import type { Bucket } from './period'

export function signedBase(t: Transaction, rates: RateMap): number {
  const v = toBase(t.amount, t.currency, rates)
  return t.type === 'income' ? v : -v
}

export function sumFlow(txs: Transaction[], flow: TxType, rates: RateMap): number {
  let s = 0
  for (const t of txs) if (t.type === flow) s += toBase(t.amount, t.currency, rates)
  return s
}

export function netFlow(txs: Transaction[], rates: RateMap): number {
  return txs.reduce((s, t) => s + signedBase(t, rates), 0)
}

export interface Slice {
  key: string
  name: string
  color: string
  icon?: string
  value: number
  count: number
}

const LABEL_COLORS = CATEGORY_PALETTE

export function categoryBreakdown(
  txs: Transaction[],
  flow: TxType,
  rates: RateMap,
  categoryMap: Map<string, Category>,
): Slice[] {
  const agg = new Map<string, { value: number; count: number }>()
  for (const t of txs) {
    if (t.type !== flow) continue
    const e = agg.get(t.categoryId) ?? { value: 0, count: 0 }
    e.value += toBase(t.amount, t.currency, rates)
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

export function labelBreakdown(txs: Transaction[], flow: TxType, rates: RateMap): Slice[] {
  const agg = new Map<string, { value: number; count: number; display: string }>()
  for (const t of txs) {
    if (t.type !== flow) continue
    const v = toBase(t.amount, t.currency, rates)
    for (const tag of t.tags) {
      const key = tag.toLowerCase()
      const e = agg.get(key) ?? { value: 0, count: 0, display: tag }
      e.value += v
      e.count++
      agg.set(key, e)
    }
  }
  return [...agg.entries()]
    .map(([key, { value, count, display }]) => ({ key, name: display, value, count }))
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: LABEL_COLORS[i % LABEL_COLORS.length] }))
}

const byDate = (a: Transaction, b: Transaction) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/** Running net-worth balance at the end of each bucket, in base currency. */
export function balanceSeries(
  allTxs: Transaction[],
  buckets: Bucket[],
  opening: number,
  openingDateISO: string,
  rates: RateMap,
): number[] {
  const from =
    openingDateISO || allTxs.reduce((m, t) => (t.date < m ? t.date : m), '9999-12-31')
  const txs = allTxs.filter((t) => t.date >= from).sort(byDate)
  const out: number[] = []
  let acc = opening
  let i = 0
  for (const b of buckets) {
    while (i < txs.length && txs[i].date <= b.endISO) {
      acc += signedBase(txs[i], rates)
      i++
    }
    out.push(acc)
  }
  return out
}

/** Cumulative cash flow (starting at 0) at the end of each bucket. */
export function cashflowSeries(periodTxs: Transaction[], buckets: Bucket[], rates: RateMap): number[] {
  const txs = periodTxs.slice().sort(byDate)
  const out: number[] = []
  let acc = 0
  let i = 0
  for (const b of buckets) {
    while (i < txs.length && txs[i].date <= b.endISO) {
      acc += signedBase(txs[i], rates)
      i++
    }
    out.push(acc)
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
