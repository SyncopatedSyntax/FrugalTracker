import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SubScreen from '@/components/SubScreen'
import { PencilIcon } from '@/components/icons'
import { useBudgets, useCategoryMap, useSettings, useTransactionsInRange } from '@/hooks'
import { formatMoney } from '@/lib/currency'
import { addMonths, startOfMonth, toISO, todayISO } from '@/lib/date'
import { budgetHistory, budgetYtdPace } from '@/lib/budgetMath'
import { alphaHex } from '@/lib/palette'
import { cn } from '@/lib/cn'
import BudgetFormSheet from './BudgetFormSheet'

/** The limit sits at this fraction of a history bar's width, so a bar that
 * crosses the marker line is visibly over budget and one short of it is under. */
const LIMIT_MARK = 0.68

export default function BudgetDetailScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const base = settings.baseCurrency
  const budgets = useBudgets()
  const categoryMap = useCategoryMap()

  const [editOpen, setEditOpen] = useState(false)

  const budget = budgets.find((b) => b.id === id)
  const category = budget?.categoryId ? categoryMap.get(budget.categoryId) : undefined

  const now = useMemo(() => new Date(), [])
  // Cover both the 12-month history window and the year-to-date span.
  const fetchStart = useMemo(() => {
    const twelve = toISO(startOfMonth(addMonths(now, -11)))
    const yearStart = `${now.getFullYear()}-01-01`
    return twelve < yearStart ? twelve : yearStart
  }, [now])
  const txs = useTransactionsInRange(fetchStart, todayISO())

  const catId = budget?.categoryId ?? null
  const limit = budget?.amount ?? 0

  const history = useMemo(
    () => (budget ? budgetHistory(txs, catId, limit, 12, now) : []),
    [txs, catId, limit, budget, now],
  )
  const pace = useMemo(
    () => (budget ? budgetYtdPace(txs, catId, limit, now) : null),
    [txs, catId, limit, budget, now],
  )

  if (!budget) {
    return (
      <SubScreen title="Budget" backTo="/more/budgets">
        <p className="py-16 text-center text-sm text-muted">Budget not found.</p>
      </SubScreen>
    )
  }

  const thisMonth = history[history.length - 1]
  const monthRatio = limit > 0 ? thisMonth.spent / limit : 0
  const monthOver = thisMonth.spent > limit

  const title = category ? category.name : 'Overall'
  const paceAhead = pace ? pace.net >= 0 : true

  return (
    <SubScreen
      title={title}
      backTo="/more/budgets"
      right={
        <button
          onClick={() => setEditOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10"
          aria-label="Edit budget"
        >
          <PencilIcon size={20} />
        </button>
      }
    >
      <div className="px-4 py-4">
        {/* This month */}
        <div className="rounded-[1.375rem] bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-lg"
              style={{ backgroundColor: (category?.color ?? '#64748b') + alphaHex(settings.categoryIconAlpha) }}
            >
              {category ? category.icon : '💰'}
            </span>
            <span className="flex-1 text-sm text-muted">This month</span>
            <span className={cn('text-sm font-semibold tabular-nums', monthOver ? 'text-expense' : 'text-content')}>
              {formatMoney(thisMonth.spent, base)}{' '}
              <span className="font-normal text-muted">/ {formatMoney(limit, base)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, monthRatio * 100)}%`,
                backgroundColor: monthOver ? 'rgb(var(--c-expense))' : (category?.color ?? 'rgb(var(--c-primary))'),
              }}
            />
          </div>
          <p className={cn('mt-1.5 text-xs', monthOver ? 'text-expense' : 'text-muted')}>
            {monthOver
              ? `${formatMoney(thisMonth.spent - limit, base)} over budget`
              : `${formatMoney(limit - thisMonth.spent, base)} left`}
          </p>
        </div>

        {/* Year-to-date pace */}
        {pace && (
          <div className="mt-3 rounded-[1.375rem] bg-surface p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {now.getFullYear()} so far · {pace.monthsElapsed} {pace.monthsElapsed === 1 ? 'month' : 'months'}
            </p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Budgeted</p>
                <p className="text-lg font-bold tabular-nums">{formatMoney(pace.budgeted, base)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Spent</p>
                <p className="text-lg font-bold tabular-nums">{formatMoney(pace.spent, base)}</p>
              </div>
            </div>
            {/* spent vs budgeted, with the budgeted amount as the full track */}
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pace.budgeted > 0 ? Math.min(100, (pace.spent / pace.budgeted) * 100) : 0}%`,
                  backgroundColor: paceAhead ? 'rgb(var(--c-income))' : 'rgb(var(--c-expense))',
                }}
              />
            </div>
            <p className={cn('mt-2 text-sm font-semibold', paceAhead ? 'text-income' : 'text-expense')}>
              {paceAhead
                ? `${formatMoney(pace.net, base)} under budget for the year`
                : `${formatMoney(-pace.net, base)} over budget for the year`}
            </p>
          </div>
        )}

        {/* 12-month history */}
        <div className="mt-3 rounded-[1.375rem] bg-surface p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Last 12 months
          </p>
          <div className="space-y-2">
            {history.map((m) => {
              // Scale so the limit sits at LIMIT_MARK; bars past it read as over.
              const frac = limit > 0 ? (m.spent / limit) * LIMIT_MARK : 0
              return (
                <div key={m.key} className="flex items-center gap-2">
                  <span className="w-12 flex-shrink-0 text-[0.6875rem] text-muted">{m.label}</span>
                  <span className="relative h-4 flex-1 overflow-hidden rounded-md bg-surface2">
                    {/* limit marker */}
                    <span
                      className="absolute inset-y-0 w-px bg-muted/50"
                      style={{ left: `${LIMIT_MARK * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-md"
                      style={{
                        width: `${Math.min(100, frac * 100)}%`,
                        backgroundColor: m.over ? 'rgb(var(--c-expense))' : 'rgb(var(--c-primary))',
                      }}
                    />
                  </span>
                  <span
                    className={cn(
                      'w-16 flex-shrink-0 text-right text-xs tabular-nums',
                      m.over ? 'font-semibold text-expense' : 'text-muted',
                    )}
                  >
                    {formatMoney(m.spent, base)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-center text-[0.6875rem] text-muted">
            Marker line = {formatMoney(limit, base)} monthly limit
          </p>
        </div>
      </div>

      <BudgetFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={budget}
        onDeleted={() => navigate('/more/budgets')}
      />
    </SubScreen>
  )
}
