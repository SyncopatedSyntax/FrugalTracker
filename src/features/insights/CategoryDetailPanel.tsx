import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListIcon } from '@/components/icons'
import { useCategoryMap, useTransactionsInRange } from '@/hooks'
import { formatMoney, formatMoneyCompact } from '@/lib/currency'
import { addMonths, startOfMonth, toISO, todayISO } from '@/lib/date'
import { cn } from '@/lib/cn'
import LineChart from './LineChart'
import { deltaVs, monthlySeriesFor, type MonthPoint } from './compute'

/** Current month + 12 prior — index 0 is the same calendar month last year,
 * which is exactly the YoY comparison baseline; the chart shows the last 12. */
const WINDOW = 13

/** The category detail (12-month trend + MoM/YoY + stats), rendered inline as
 * an expanded section under a tapped category row on the Insights breakdown
 * (rather than a separate screen). Self-contained: give it a category id and
 * it fetches its own 13-month window. */
export default function CategoryDetailPanel({
  categoryId,
  base,
}: {
  categoryId: string
  base: string
}) {
  const navigate = useNavigate()
  const category = useCategoryMap().get(categoryId)

  const now = useMemo(() => new Date(), [])
  const fetchStart = toISO(startOfMonth(addMonths(now, -(WINDOW - 1))))
  const txs = useTransactionsInRange(fetchStart, todayISO())
  const series = useMemo(() => monthlySeriesFor(txs, categoryId, WINDOW, now), [txs, categoryId, now])

  const cur = series[WINDOW - 1]
  const momDelta = deltaVs(series[WINDOW - 2].value, cur.value)
  const yoyDelta = deltaVs(series[0].value, cur.value)

  const chartPoints = useMemo(() => series.slice(1), [series])
  const txCount = chartPoints.reduce((s, p) => s + p.count, 0)
  const total12 = chartPoints.reduce((s, p) => s + p.value, 0)

  // Average over *complete* months only (the current one would drag it down),
  // starting from the first month with any activity in the window — a
  // 3-month-old category averages over 3 months, not 12.
  const avgMonthly = useMemo(() => {
    const completed = series.slice(0, WINDOW - 1)
    const first = completed.findIndex((p) => p.count > 0)
    if (first < 0) return null
    const window = completed.slice(first)
    return window.reduce((s, p) => s + p.value, 0) / window.length
  }, [series])

  if (!category) return null

  const openTransactions = () => {
    const params = new URLSearchParams()
    params.set('type', category.type)
    params.set('categoryId', categoryId)
    params.set('from', toISO(startOfMonth(addMonths(now, -(WINDOW - 2)))))
    params.set('to', todayISO())
    navigate(`/transactions?${params.toString()}`)
  }

  return (
    <div className="mb-1 mt-1 rounded-xl bg-surface2/50 p-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">This month</p>
          <p
            className={cn(
              'truncate text-xl font-bold tabular-nums',
              category.type === 'expense' ? 'text-expense' : 'text-income',
            )}
          >
            {category.type === 'expense' ? '-' : ''}
            {formatMoney(cur.value, base)}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <DeltaChip label="vs last mo" delta={momDelta} flow={category.type} />
          <DeltaChip label={`vs ${series[0].label}`} delta={yoyDelta} flow={category.type} />
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-surface p-3">
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
          Last 12 months
        </p>
        <LineChart
          series={[
            {
              name: category.name,
              points: chartPoints.map((p) => p.value),
              color: category.color,
              fill: true,
              dot: true,
            },
          ]}
          labels={chartPoints.map((p: MonthPoint) => p.label)}
          formatY={(n) => formatMoneyCompact(n, base)}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Avg / month" value={avgMonthly == null ? '—' : formatMoney(avgMonthly, base)} />
        <Stat label="Total 12 mo" value={formatMoney(total12, base)} />
        <Stat label="Entries" value={String(txCount)} />
      </div>

      <button
        onClick={openTransactions}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold"
      >
        <ListIcon size={16} />
        View transactions
      </button>
    </div>
  )
}

/** Colored by whether the change is good news for this flow direction:
 * spending more (expense up) is red, earning more (income up) is green. */
function DeltaChip({
  label,
  delta,
  flow,
}: {
  label: string
  delta: number | null
  flow: 'expense' | 'income'
}) {
  const pct = delta == null ? null : Math.round(delta * 100)
  const good = delta != null && (flow === 'expense' ? delta < 0 : delta > 0)
  const flat = delta != null && pct === 0
  return (
    <span className="flex flex-col rounded-lg bg-surface px-2.5 py-1.5">
      <span className="text-[0.625rem] text-muted">{label}</span>
      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          delta == null || flat ? 'text-muted' : good ? 'text-income' : 'text-expense',
        )}
      >
        {pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`}
      </span>
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-2.5">
      <p className="text-[0.625rem] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{value}</p>
    </div>
  )
}
