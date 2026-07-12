import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FilterIcon, SearchIcon, XIcon } from '@/components/icons'
import { useAllTransactions, useCategoryMap, useSettings } from '@/hooks'
import type { Transaction, TxType } from '@/db/types'
import { formatMoney } from '@/lib/currency'
import { formatDayHeader } from '@/lib/date'
import { cn } from '@/lib/cn'
import TransactionRow from './TransactionRow'
import FilterSheet from './FilterSheet'
import { activeFilterCount, emptyFilters, filterTransactions, type Filters } from './filters'

/** Insights' category/label rows link here with ?type=&categoryId=|tag=&from=&to=
 * to drill into the transactions behind a breakdown result. */
function filtersFromSearchParams(params: URLSearchParams): Filters {
  const type = params.get('type')
  const categoryId = params.get('categoryId')
  const tag = params.get('tag')
  const from = params.get('from')
  const to = params.get('to')
  if (!type && !categoryId && !tag && !from && !to) return emptyFilters
  return {
    type: (type as TxType | null) === 'expense' || type === 'income' ? (type as TxType) : 'all',
    categoryIds: categoryId ? [categoryId] : [],
    tags: tag ? [tag] : [],
    from: from || null,
    to: to || null,
  }
}

export default function TransactionsScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const all = useAllTransactions()
  const categoryMap = useCategoryMap()
  const settings = useSettings()
  const base = settings.baseCurrency

  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams))
  const [filterOpen, setFilterOpen] = useState(false)

  // Consume the incoming filter once, then clear it from the URL so it
  // doesn't linger or get reapplied if this screen remounts.
  useEffect(() => {
    if (searchParams.toString()) setSearchParams({}, { replace: true })
  }, [])

  const filtered = useMemo(
    () => filterTransactions(all, filters, keyword, categoryMap),
    [all, filters, keyword, categoryMap],
  )

  // Search/filter still run over the full history (correctness), but only a
  // page of rows actually mounts at a time — the DOM cost of the list, not
  // the Dexie read, is what scales badly with years of data.
  const PAGE = 60
  const [visibleCount, setVisibleCount] = useState(PAGE)
  useEffect(() => setVisibleCount(PAGE), [filtered])
  const visible = filtered.length > visibleCount ? filtered.slice(0, visibleCount) : filtered

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of visible) {
      const arr = map.get(tx.date)
      if (arr) arr.push(tx)
      else map.set(tx.date, [tx])
    }
    return [...map.entries()]
  }, [visible])

  const net = useMemo(
    () =>
      filtered.reduce((sum, tx) => sum + (tx.type === 'expense' ? -tx.baseAmount : tx.baseAmount), 0),
    [filtered],
  )

  const fCount = activeFilterCount(filters)

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top pb-3">
        <div className="mx-4 mt-2 rounded-[22px] bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-xl font-bold">Activity</h1>
          <span className="text-xs text-muted">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · net{' '}
            <span className={net < 0 ? 'text-expense' : 'text-income'}>
              {formatMoney(net, base)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface2 px-3">
            <SearchIcon size={18} className="text-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search notes, categories, tags"
              className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
            />
            {keyword && (
              <button onClick={() => setKeyword('')} aria-label="Clear search">
                <XIcon size={16} className="text-muted" />
              </button>
            )}
          </div>
          {fCount > 0 && (
            <button
              onClick={() => setFilters(emptyFilters)}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-primary text-primary active:scale-95"
              aria-label="Clear filters"
            >
              <XIcon size={18} />
            </button>
          )}
          <button
            onClick={() => setFilterOpen(true)}
            className={cn(
              'relative grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border',
              fCount ? 'border-primary text-primary' : 'border-border text-muted',
            )}
            aria-label="Filters"
          >
            <FilterIcon size={20} />
            {fCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-fg">
                {fCount}
              </span>
            )}
          </button>
        </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="text-4xl">🧾</p>
            <p className="mt-3 text-sm text-muted">
              {all.length === 0
                ? 'No transactions yet. Add your first from the Add tab.'
                : 'No transactions match your search or filters.'}
            </p>
            {(fCount > 0 || keyword) && (
              <button
                onClick={() => {
                  setFilters(emptyFilters)
                  setKeyword('')
                }}
                className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          groups.map(([date, txs]) => {
            const dayNet = txs.reduce(
              (sum, tx) => sum + (tx.type === 'expense' ? -tx.baseAmount : tx.baseAmount),
              0,
            )
            return (
              <section key={date}>
                <div className="sticky top-0 z-[1] flex items-center justify-between bg-surface2 px-4 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-content">
                    {formatDayHeader(date)}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums',
                      dayNet < 0 ? 'text-expense' : 'text-income',
                    )}
                  >
                    {formatMoney(dayNet, base)}
                  </span>
                </div>
                <div className="divide-y divide-border/60">
                  {txs.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      category={categoryMap.get(tx.categoryId)}
                      base={base}
                      onClick={() => navigate(`/tx/${tx.id}/edit`)}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
        {filtered.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((c) => c + PAGE)}
            className="mx-4 my-3 w-[calc(100%-2rem)] rounded-[22px] border border-border py-3 text-sm font-semibold text-muted active:bg-surface2"
          >
            Load {Math.min(PAGE, filtered.length - visibleCount)} more
          </button>
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
      />
    </div>
  )
}
