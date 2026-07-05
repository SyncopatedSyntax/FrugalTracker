import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/db'
import { DEFAULT_SETTINGS } from '@/db/seed'
import type { Category, Settings, TxType } from '@/db/types'
import type { RateMap } from '@/lib/convert'

/* -------------------------------- Settings ------------------------------- */

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('app'), [])
  return s ?? DEFAULT_SETTINGS
}

/* ------------------------------- Categories ------------------------------ */

export function useCategories(includeArchived = false): Category[] {
  return (
    useLiveQuery(async () => {
      const all = await db.categories.orderBy('sortOrder').toArray()
      return includeArchived ? all : all.filter((c) => !c.isArchived)
    }, [includeArchived]) ?? []
  )
}

export function useCategoriesByType(type: TxType, includeArchived = false): Category[] {
  const all = useCategories(includeArchived)
  return useMemo(() => all.filter((c) => c.type === type), [all, type])
}

export function useCategoryMap(): Map<string, Category> {
  const all = useCategories(true)
  return useMemo(() => new Map(all.map((c) => [c.id, c])), [all])
}

/* --------------------------------- Rates --------------------------------- */

export function useRateMap(): RateMap {
  const rates = useLiveQuery(() => db.rates.toArray(), [])
  return useMemo(() => new Map((rates ?? []).map((r) => [r.currency, r.rate])), [rates])
}

export function useRates() {
  return useLiveQuery(() => db.rates.toArray(), []) ?? []
}

/* ---------------------------------- Tags --------------------------------- */

export function useTags() {
  return (
    useLiveQuery(() => db.tags.orderBy('usageCount').reverse().toArray(), []) ?? []
  )
}

/* -------------------------------- Budgets -------------------------------- */

export function useBudgets() {
  return useLiveQuery(() => db.budgets.toArray(), []) ?? []
}

/* ------------------------------ Transactions ----------------------------- */

/** All transactions, newest first (by date then creation time). */
export function useAllTransactions() {
  return (
    useLiveQuery(async () => {
      const all = await db.transactions.toArray()
      return all.sort(sortByRecency)
    }, []) ?? []
  )
}

/** Transactions whose date falls within [startISO, endISO] inclusive. */
export function useTransactionsInRange(startISO: string, endISO: string) {
  return (
    useLiveQuery(async () => {
      const rows = await db.transactions
        .where('date')
        .between(startISO, endISO, true, true)
        .toArray()
      return rows.sort(sortByRecency)
    }, [startISO, endISO]) ?? []
  )
}

export function useTransaction(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.transactions.get(id) : undefined), [id])
}

export function useTransactionCount() {
  return useLiveQuery(() => db.transactions.count(), [])
}

function sortByRecency(
  a: { date: string; createdAt: number },
  b: { date: string; createdAt: number },
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.createdAt - a.createdAt
}
