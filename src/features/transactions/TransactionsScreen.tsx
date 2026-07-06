import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilterIcon, SearchIcon, XIcon } from '@/components/icons'
import { useAllTransactions, useCategoryMap, useRateMap, useSettings } from '@/hooks'
import type { Transaction } from '@/db/types'
import { toBase } from '@/lib/convert'
import { formatMoney } from '@/lib/currency'
import { formatDayHeader } from '@/lib/date'
import { cn } from '@/lib/cn'
import TransactionRow from './TransactionRow'
import FilterSheet from './FilterSheet'
import { activeFilterCount, emptyFilters, filterTransactions, type Filters } from './filters'

export default function TransactionsScreen() {
  const navigate = useNavigate()
  const all = useAllTransactions()
  const categoryMap = useCategoryMap()
  const rates = useRateMap()
  const settings = useSettings()
  const base = settings.baseCurrency

  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [filterOpen, setFilterOpen] = useState(false)

  const filtered = useMemo(
    () => filterTransactions(all, filters, keyword, categoryMap),
    [all, filters, keyword, categoryMap],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of filtered) {
      const arr = map.get(tx.date)
      if (arr) arr.push(tx)
      else map.set(tx.date, [tx])
    }
    return [...map.entries()]
  }, [filtered])

  const net = useMemo(
    () =>
      filtered.reduce((sum, tx) => {
        const v = toBase(tx.amount, tx.currency, rates)
        return sum + (tx.type === 'expense' ? -v : v)
      }, 0),
    [filtered, rates],
  )

  const fCount = activeFilterCount(filters)

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top border-b border-border bg-surface/95 px-4 pt-2 pb-3 backdrop-blur">
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
      </header>

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
            const dayNet = txs.reduce((sum, tx) => {
              const v = toBase(tx.amount, tx.currency, rates)
              return sum + (tx.type === 'expense' ? -v : v)
            }, 0)
            return (
              <section key={date}>
                <div className="sticky top-0 z-[1] flex items-center justify-between bg-surface2/95 px-4 py-2 backdrop-blur">
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
                      rates={rates}
                      onClick={() => navigate(`/tx/${tx.id}/edit`)}
                    />
                  ))}
                </div>
              </section>
            )
          })
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
