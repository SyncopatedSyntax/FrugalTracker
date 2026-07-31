import type { Category, Transaction, TxType } from '@/db/types'

export interface Filters {
  type: TxType | 'all'
  categoryIds: string[]
  tags: string[]
  /** Keep only transactions carrying no tags at all — what the Insights
   * Labels view's "Untagged" slice drills into. Mutually exclusive with
   * `tags`: combined they'd mean "untagged AND tagged X", which is never
   * anything, so the UI clears one when the other is set. */
  untagged: boolean
  from: string | null
  to: string | null
}

export const emptyFilters: Filters = {
  type: 'all',
  categoryIds: [],
  tags: [],
  untagged: false,
  from: null,
  to: null,
}

export function filterTransactions(
  txs: Transaction[],
  filters: Filters,
  keyword: string,
  categoryMap: Map<string, Category>,
): Transaction[] {
  const kw = keyword.trim().toLowerCase()
  const tagSet = new Set(filters.tags.map((t) => t.toLowerCase()))
  return txs.filter((tx) => {
    if (filters.type !== 'all' && tx.type !== filters.type) return false
    if (filters.categoryIds.length && !filters.categoryIds.includes(tx.categoryId)) return false
    if (filters.untagged && tx.tags.length) return false
    if (tagSet.size && !tx.tags.some((t) => tagSet.has(t.toLowerCase()))) return false
    if (filters.from && tx.date < filters.from) return false
    if (filters.to && tx.date > filters.to) return false
    if (kw) {
      const cat = categoryMap.get(tx.categoryId)
      const hay = `${tx.note} ${cat?.name ?? ''} ${tx.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

export function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.type !== 'all') n++
  if (f.categoryIds.length) n++
  if (f.tags.length || f.untagged) n++
  if (f.from || f.to) n++
  return n
}
