import { useMemo, useState } from 'react'
import Segmented from '@/components/Segmented'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { useAllTransactions, useCategoryMap, useRateMap, useSettings } from '@/hooks'
import type { TxType } from '@/db/types'
import { toBase } from '@/lib/convert'
import { formatMoney, formatMoneyCompact } from '@/lib/currency'
import { addMonths, addYears, daysInMonth, monthLabel, monthShort, parseISO } from '@/lib/date'
import { cn } from '@/lib/cn'
import DonutChart, { type DonutSlice } from './DonutChart'
import BarTimeline, { type TimelineBar } from './BarTimeline'

type PeriodType = 'month' | 'year' | 'all'

export default function InsightsScreen() {
  const all = useAllTransactions()
  const categoryMap = useCategoryMap()
  const rates = useRateMap()
  const settings = useSettings()
  const base = settings.baseCurrency

  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [flow, setFlow] = useState<TxType>('expense')
  const [selectedCat, setSelectedCat] = useState<string | null>(null)

  const now = new Date()
  const anchorMonthKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
  const nowMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const canGoNext =
    periodType === 'month'
      ? anchorMonthKey < nowMonthKey
      : periodType === 'year'
        ? anchor.getFullYear() < now.getFullYear()
        : false

  const inPeriod = useMemo(() => {
    return (d: string) => {
      if (periodType === 'all') return true
      if (periodType === 'year') return d.slice(0, 4) === String(anchor.getFullYear())
      return d.slice(0, 7) === anchorMonthKey
    }
  }, [periodType, anchor, anchorMonthKey])

  const periodTxs = useMemo(() => all.filter((t) => inPeriod(t.date)), [all, inPeriod])

  const totals = useMemo(() => {
    let expense = 0
    let income = 0
    for (const t of periodTxs) {
      const v = toBase(t.amount, t.currency, rates)
      if (t.type === 'expense') expense += v
      else income += v
    }
    return { expense, income, net: income - expense }
  }, [periodTxs, rates])

  const flowTxs = useMemo(() => periodTxs.filter((t) => t.type === flow), [periodTxs, flow])
  const flowTotal = flow === 'expense' ? totals.expense : totals.income

  // Category breakdown
  const slices: DonutSlice[] = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const t of flowTxs) {
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + toBase(t.amount, t.currency, rates))
    }
    return [...byCat.entries()]
      .map(([id, value]) => {
        const c = categoryMap.get(id)
        return { key: id, label: c?.name ?? 'Uncategorized', value, color: c?.color ?? '#64748b' }
      })
      .sort((a, b) => b.value - a.value)
  }, [flowTxs, rates, categoryMap])

  // Timeline buckets
  const bars: TimelineBar[] = useMemo(() => {
    const add = (arr: TimelineBar[], idx: number, v: number) => {
      if (idx >= 0 && idx < arr.length) arr[idx].value += v
    }
    if (periodType === 'month') {
      const n = daysInMonth(anchor)
      const mShort = monthShort(anchor.getMonth())
      const arr: TimelineBar[] = Array.from({ length: n }, (_, i) => ({
        key: String(i + 1),
        label: String(i + 1),
        fullLabel: `${i + 1} ${mShort}`,
        value: 0,
      }))
      flowTxs.forEach((t) => add(arr, parseISO(t.date).getDate() - 1, toBase(t.amount, t.currency, rates)))
      return arr
    }
    if (periodType === 'year') {
      const letters = 'JFMAMJJASOND'
      const arr: TimelineBar[] = Array.from({ length: 12 }, (_, m) => ({
        key: String(m),
        label: letters[m],
        fullLabel: monthLabel(new Date(anchor.getFullYear(), m, 1)),
        value: 0,
      }))
      flowTxs.forEach((t) => add(arr, parseISO(t.date).getMonth(), toBase(t.amount, t.currency, rates)))
      return arr
    }
    // all-time: bucket by year
    const years = all.map((t) => Number(t.date.slice(0, 4)))
    const minY = years.length ? Math.min(...years) : now.getFullYear()
    const maxY = years.length ? Math.max(...years) : now.getFullYear()
    const list: TimelineBar[] = []
    const index = new Map<number, number>()
    for (let y = minY; y <= maxY; y++) {
      index.set(y, list.length)
      list.push({ key: String(y), label: `'${String(y).slice(2)}`, fullLabel: String(y), value: 0 })
    }
    flowTxs.forEach((t) => {
      const idx = index.get(Number(t.date.slice(0, 4)))
      if (idx !== undefined) list[idx].value += toBase(t.amount, t.currency, rates)
    })
    return list
  }, [periodType, anchor, flowTxs, rates, all, now])

  const maxCat = slices.length ? slices[0].value : 0
  const selected = selectedCat ? slices.find((s) => s.key === selectedCat) : undefined
  const flowColor = flow === 'expense' ? 'rgb(var(--c-expense))' : 'rgb(var(--c-income))'

  const periodLabel =
    periodType === 'month' ? monthLabel(anchor) : periodType === 'year' ? String(anchor.getFullYear()) : 'All time'

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top border-b border-border bg-surface/95 px-4 pt-2 pb-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-bold">Insights</h1>
          <span className="text-xs text-muted">in {base}</span>
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
            { value: 'all', label: 'All time' },
          ]}
          value={periodType}
          onChange={(v) => {
            setPeriodType(v)
            setSelectedCat(null)
          }}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {/* Period nav */}
        {periodType !== 'all' && (
          <div className="flex items-center justify-between py-3">
            <button
              onClick={() =>
                setAnchor((a) => (periodType === 'month' ? addMonths(a, -1) : addYears(a, -1)))
              }
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface2"
              aria-label="Previous period"
            >
              <ChevronLeftIcon size={20} />
            </button>
            <span className="text-base font-semibold">{periodLabel}</span>
            <button
              disabled={!canGoNext}
              onClick={() =>
                setAnchor((a) => (periodType === 'month' ? addMonths(a, 1) : addYears(a, 1)))
              }
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface2 disabled:opacity-30"
              aria-label="Next period"
            >
              <ChevronRightIcon size={20} />
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2 py-2">
          <SummaryCard label="Spent" value={formatMoneyCompact(totals.expense, base)} tone="expense" />
          <SummaryCard label="Earned" value={formatMoneyCompact(totals.income, base)} tone="income" />
          <SummaryCard
            label="Net"
            value={formatMoneyCompact(totals.net, base)}
            tone={totals.net < 0 ? 'expense' : 'income'}
          />
        </div>

        {periodTxs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl">📊</p>
            <p className="mt-3 text-sm text-muted">No transactions in this period.</p>
          </div>
        ) : (
          <>
            {/* Flow toggle */}
            <div className="flex justify-center py-3">
              <Segmented
                options={[
                  { value: 'expense', label: 'Expenses' },
                  { value: 'income', label: 'Income' },
                ]}
                value={flow}
                onChange={(v) => {
                  setFlow(v)
                  setSelectedCat(null)
                }}
                activeClass={cn('text-white shadow', flow === 'expense' ? 'bg-expense' : 'bg-income')}
              />
            </div>

            {/* Timeline */}
            <section className="rounded-2xl bg-surface p-4">
              <h2 className="mb-1 text-sm font-semibold text-muted">
                {flow === 'expense' ? 'Spending' : 'Income'} over time
              </h2>
              <BarTimeline
                bars={bars}
                color={flowColor}
                formatValue={(n) => formatMoney(n, base)}
              />
            </section>

            {/* Category breakdown */}
            {slices.length > 0 && (
              <section className="mt-4 rounded-2xl bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold text-muted">By category</h2>
                <DonutChart
                  slices={slices}
                  total={flowTotal}
                  centerLabel={selected ? selected.label : 'Total'}
                  centerValue={formatMoneyCompact(selected ? selected.value : flowTotal, base)}
                  selectedKey={selectedCat}
                  onSelect={setSelectedCat}
                />
                <div className="mt-4 space-y-1">
                  {slices.map((s) => {
                    const pct = flowTotal > 0 ? (s.value / flowTotal) * 100 : 0
                    const on = selectedCat === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => setSelectedCat(on ? null : s.key)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left',
                          on ? 'bg-surface2' : 'hover:bg-surface2/60',
                        )}
                      >
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="mb-1 flex items-center justify-between">
                            <span className="truncate text-sm font-medium">{s.label}</span>
                            <span className="ml-2 flex-shrink-0 text-sm font-semibold tabular-nums">
                              {formatMoney(s.value, base)}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${maxCat > 0 ? (s.value / maxCat) * 100 : 0}%`, backgroundColor: s.color }}
                              />
                            </span>
                            <span className="w-9 flex-shrink-0 text-right text-[11px] text-muted tabular-nums">
                              {pct.toFixed(0)}%
                            </span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'expense' | 'income'
}) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-base font-bold tabular-nums',
          tone === 'expense' ? 'text-expense' : 'text-income',
        )}
      >
        {value}
      </p>
    </div>
  )
}
