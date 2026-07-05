import { useMemo, useState } from 'react'
import Segmented from '@/components/Segmented'
import { useAllTransactions, useBudgets, useCategoryMap, useRateMap, useSettings } from '@/hooks'
import type { TxType } from '@/db/types'
import { formatMoney } from '@/lib/currency'
import { cn } from '@/lib/cn'
import {
  periodRange,
  prorateMonthly,
  rollingMonthlyAverage,
  sameRangeLastYear,
  sumInRange,
  type Timeframe,
} from '@/lib/budgetMath'

const CAPTIONS: Record<Timeframe, string> = {
  week: 'Week to date',
  month: 'Month to date',
  year: 'Year to date',
}

interface Props {
  type: TxType
  categoryId: string | null
}

export default function BudgetPanel({ type, categoryId }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const settings = useSettings()
  const base = settings.baseCurrency
  const txs = useAllTransactions()
  const rates = useRateMap()
  const budgets = useBudgets()
  const categoryMap = useCategoryMap()

  const now = new Date()
  const range = useMemo(
    () => periodRange(timeframe, now, settings.firstDayOfWeek),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeframe, settings.firstDayOfWeek],
  )

  return (
    <div className="mx-4 mt-2 rounded-[22px] bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{CAPTIONS[timeframe]}</span>
        <Segmented
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
          value={timeframe}
          onChange={setTimeframe}
          className="[&>button]:px-2.5 [&>button]:py-1 [&>button]:text-[11px]"
        />
      </div>

      {type === 'income' ? (
        <IncomeCompare range={range} txs={txs} rates={rates} base={base} />
      ) : (
        <ExpenseCompare
          range={range}
          timeframe={timeframe}
          categoryId={categoryId}
          txs={txs}
          rates={rates}
          budgets={budgets}
          categoryMap={categoryMap}
          base={base}
        />
      )}
    </div>
  )
}

function ExpenseCompare({
  range,
  timeframe,
  categoryId,
  txs,
  rates,
  budgets,
  categoryMap,
  base,
}: {
  range: { startISO: string; endISO: string }
  timeframe: Timeframe
  categoryId: string | null
  txs: ReturnType<typeof useAllTransactions>
  rates: ReturnType<typeof useRateMap>
  budgets: ReturnType<typeof useBudgets>
  categoryMap: ReturnType<typeof useCategoryMap>
  base: string
}) {
  const now = new Date()
  const category = categoryId ? categoryMap.get(categoryId) : undefined
  const spent = sumInRange(txs, range, 'expense', categoryId, rates)

  const budget = budgets.find((b) => b.categoryId === categoryId)
  let target = 0
  let isAvg = false
  let hasComparison = true

  if (budget) {
    target = prorateMonthly(budget.amount, timeframe, now)
  } else {
    const avg = rollingMonthlyAverage(txs, categoryId, now, rates)
    if (avg > 0) {
      target = prorateMonthly(avg, timeframe, now)
      isAvg = true
    } else {
      hasComparison = false
    }
  }

  const ratio = target > 0 ? spent / target : 0
  const over = hasComparison && ratio > 1
  const near = hasComparison && ratio >= 0.8 && !over
  const barColor = over
    ? 'rgb(var(--c-expense))'
    : near
      ? '#D1A54E'
      : (category?.color ?? 'rgb(var(--c-primary))')

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-sm"
          style={{ backgroundColor: (category?.color ?? '#767B70') + '22' }}
        >
          {category ? category.icon : '💰'}
        </span>
        <span className="flex-1 truncate text-sm font-semibold">
          {category ? category.name : 'All categories'}
        </span>
        {hasComparison && (
          <span className="flex-shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {isAvg ? 'Avg · 12mo' : 'Budget'}
          </span>
        )}
      </div>

      {hasComparison ? (
        <>
          <div className="flex items-baseline justify-between">
            <span className={cn('text-base font-bold tabular-nums', over && 'text-expense')}>
              {formatMoney(spent, base)}
            </span>
            <span className="text-xs text-muted tabular-nums">/ {formatMoney(target, base)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: barColor }}
            />
          </div>
          <p className={cn('mt-1 text-xs', over ? 'text-expense' : 'text-muted')}>
            {over
              ? `${formatMoney(spent - target, base)} over`
              : `${formatMoney(target - spent, base)} left`}
          </p>
        </>
      ) : (
        <>
          <span className="text-base font-bold tabular-nums">{formatMoney(spent, base)}</span>
          <p className="mt-1 text-xs text-muted">No budget or spending history to compare yet</p>
        </>
      )}
    </div>
  )
}

function IncomeCompare({
  range,
  txs,
  rates,
  base,
}: {
  range: { startISO: string; endISO: string }
  txs: ReturnType<typeof useAllTransactions>
  rates: ReturnType<typeof useRateMap>
  base: string
}) {
  const current = sumInRange(txs, range, 'income', null, rates)
  const lastYearRange = sameRangeLastYear(range)
  const lastYear = sumInRange(txs, lastYearRange, 'income', null, rates)
  const hasLastYear = lastYear > 0
  const pct = hasLastYear ? ((current - lastYear) / lastYear) * 100 : null

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-income/15 text-sm">
          💵
        </span>
        <span className="flex-1 truncate text-sm font-semibold">Income</span>
        <span className="flex-shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          vs last year
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-base font-bold tabular-nums">{formatMoney(current, base)}</span>
        {hasLastYear && (
          <span className="text-xs text-muted tabular-nums">
            was {formatMoney(lastYear, base)}
          </span>
        )}
      </div>
      {hasLastYear ? (
        <p className={cn('mt-1.5 text-xs font-medium', (pct ?? 0) >= 0 ? 'text-income' : 'text-expense')}>
          {(pct ?? 0) >= 0 ? '+' : ''}
          {(pct ?? 0).toFixed(0)}% vs same period last year
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted">No income recorded this time last year</p>
      )}
    </div>
  )
}
