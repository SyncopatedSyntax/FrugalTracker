import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '@/db/db'
import { isDemoModeOn, subscribeDemoMode } from '@/db/demoMode'
import { DEFAULT_SETTINGS } from '@/db/seed'
import type { Category, Settings, TxType } from '@/db/types'
import type { RateMap } from '@/lib/convert'

/* -------------------------------- Settings ------------------------------- */

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('app'), [])
  // Merge defaults so settings saved before newer fields existed still resolve.
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS
}

/** Whether dark mode is currently in effect (resolving `theme: 'system'`
 * against the OS preference) — for previews that need to match what the
 * user is actually seeing, independent of the app's own `.dark` class. */
export function useIsDark(): boolean {
  const settings = useSettings()
  const resolve = () =>
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [isDark, setIsDark] = useState(resolve)

  useEffect(() => {
    setIsDark(resolve())
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme])

  return isDark
}

/** The GitHub backup connection, or `undefined` when not connected — see
 * `lib/githubBackup.ts`. */
export function useGithubConfig() {
  return useLiveQuery(() => db.githubConfig.get('default'), [])
}

/** Whether Demo Mode is currently active — backed by a localStorage flag
 * (not Dexie, since it needs to survive the very table-clearing it triggers),
 * so components subscribe to it explicitly rather than via useLiveQuery. */
export function useDemoMode(): boolean {
  const [on, setOn] = useState(isDemoModeOn)
  useEffect(() => subscribeDemoMode(() => setOn(isDemoModeOn())), [])
  return on
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
    useLiveQuery(async () => {
      const all = await db.tags.toArray()
      return all.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    }, []) ?? []
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

/** Earliest transaction date across all history, or '' when there are none —
 * a single indexed lookup (via the `date` index) rather than loading every
 * row just to find the minimum. */
export function useEarliestTransactionDate(): string {
  const first = useLiveQuery(() => db.transactions.orderBy('date').first(), [])
  return first?.date ?? ''
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
