import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SubScreen from '@/components/SubScreen'
import Segmented from '@/components/Segmented'
import { PlusIcon } from '@/components/icons'
import {
  useBudgets,
  useCategoryMap,
  useSettings,
  useTransactionsInRange,
} from '@/hooks'
import type { Budget } from '@/db/types'
import { formatMoney } from '@/lib/currency'
import { endOfMonth, monthLabel, startOfMonth, toISO } from '@/lib/date'
import { alphaHex } from '@/lib/palette'
import { cn } from '@/lib/cn'
import BudgetFormSheet from './BudgetFormSheet'

type SortKey = 'used' | 'left' | 'over'

export default function BudgetsScreen() {
  const navigate = useNavigate()
  const settings = useSettings()
  const base = settings.baseCurrency
  const chipAlpha = alphaHex(settings.categoryIconAlpha)
  const budgets = useBudgets()
  const categoryMap = useCategoryMap()

  const now = new Date()
  const monthTxs = useTransactionsInRange(toISO(startOfMonth(now)), toISO(endOfMonth(now)))

  const { spentByCat, totalSpent } = useMemo(() => {
    const map = new Map<string, number>()
    let total = 0
    for (const t of monthTxs) {
      if (t.type !== 'expense') continue
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.baseAmount)
      total += t.baseAmount
    }
    return { spentByCat: map, totalSpent: total }
  }, [monthTxs])

  const [addOpen, setAddOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('used')
  const [overOnly, setOverOnly] = useState(false)

  // Enrich each budget with its this-month spend/ratio, then sort + filter.
  const rows = useMemo(() => {
    const enriched = budgets.map((b) => {
      const spent = b.categoryId ? (spentByCat.get(b.categoryId) ?? 0) : totalSpent
      const ratio = b.amount > 0 ? spent / b.amount : 0
      return { b, spent, ratio, remaining: b.amount - spent, over: spent - b.amount }
    })
    const visible = overOnly ? enriched.filter((r) => r.ratio > 1) : enriched
    const cmp = {
      used: (a: typeof visible[number], z: typeof visible[number]) => z.ratio - a.ratio,
      left: (a: typeof visible[number], z: typeof visible[number]) => a.remaining - z.remaining,
      over: (a: typeof visible[number], z: typeof visible[number]) => z.over - a.over,
    }[sort]
    return [...visible].sort(cmp)
  }, [budgets, spentByCat, totalSpent, sort, overOnly])

  const overCount = useMemo(
    () =>
      budgets.filter((b) => {
        const spent = b.categoryId ? (spentByCat.get(b.categoryId) ?? 0) : totalSpent
        return spent > b.amount
      }).length,
    [budgets, spentByCat, totalSpent],
  )

  return (
    <SubScreen
      title="Budgets"
      right={
        <button
          onClick={() => setAddOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10"
          aria-label="Add budget"
        >
          <PlusIcon size={22} />
        </button>
      }
    >
      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-muted">
          {monthLabel(now)} · limits in {base}
          {budgets.length > 0 && overCount > 0 && (
            <span className="text-expense"> · {overCount} over</span>
          )}
        </p>

        {budgets.length === 0 ? (
          <div className="rounded-[1.375rem] bg-surface p-8 text-center">
            <p className="text-4xl">🎯</p>
            <p className="mt-3 text-sm text-muted">
              No budgets yet. Tap + to set a monthly spending limit.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Segmented
                options={[
                  { value: 'used', label: 'Used' },
                  { value: 'left', label: 'Left' },
                  { value: 'over', label: 'Over' },
                ]}
                value={sort}
                onChange={setSort}
              />
              <button
                onClick={() => setOverOnly((v) => !v)}
                className={cn(
                  'flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium',
                  overOnly ? 'border-expense bg-expense/10 text-expense' : 'border-border text-muted',
                )}
              >
                Over only
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-[1.375rem] bg-surface py-10 text-center text-sm text-muted">
                No budgets are over their limit this month. 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {rows.map(({ b, spent, ratio }) => (
                  <BudgetRow
                    key={b.id}
                    budget={b}
                    spent={spent}
                    ratio={ratio}
                    base={base}
                    chipAlpha={chipAlpha}
                    category={b.categoryId ? categoryMap.get(b.categoryId) : undefined}
                    onClick={() => navigate(`/more/budgets/${b.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BudgetFormSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </SubScreen>
  )
}

function BudgetRow({
  budget: b,
  spent,
  ratio,
  base,
  chipAlpha,
  category,
  onClick,
}: {
  budget: Budget
  spent: number
  ratio: number
  base: string
  chipAlpha: string
  category?: { name: string; icon: string; color: string }
  onClick: () => void
}) {
  const over = ratio > 1
  const near = ratio >= 0.8 && !over
  const barColor = over
    ? 'rgb(var(--c-expense))'
    : near
      ? '#D1A54E'
      : (category?.color ?? 'rgb(var(--c-primary))')
  return (
    <button onClick={onClick} className="block w-full rounded-[1.375rem] bg-surface p-4 text-left">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-base"
          style={{ backgroundColor: (category?.color ?? '#64748b') + chipAlpha }}
        >
          {category ? category.icon : '💰'}
        </span>
        <span className="flex-1 text-sm font-semibold">{category ? category.name : 'Overall'}</span>
        <span
          className={cn('text-sm font-semibold tabular-nums', over ? 'text-expense' : 'text-content')}
        >
          {formatMoney(spent, base)}{' '}
          <span className="font-normal text-muted">/ {formatMoney(b.amount, base)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: barColor }}
        />
      </div>
      <p className={cn('mt-1.5 text-xs', over ? 'text-expense' : 'text-muted')}>
        {over
          ? `${formatMoney(spent - b.amount, base)} over budget`
          : `${formatMoney(b.amount - spent, base)} left`}
      </p>
    </button>
  )
}
