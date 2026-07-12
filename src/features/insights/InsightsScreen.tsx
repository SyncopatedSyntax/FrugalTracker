import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Segmented from '@/components/Segmented'
import { ChevronRightIcon, PencilIcon, TagIcon } from '@/components/icons'
import { useCategoryMap, useEarliestTransactionDate, useSettings, useTransactionsInRange } from '@/hooks'
import type { TxType } from '@/db/types'
import { formatMoney, formatMoneyCompact } from '@/lib/currency'
import { addDays, todayISO, toISO } from '@/lib/date'
import { cn } from '@/lib/cn'
import { categoryPalette } from '@/lib/palette'
import PeriodBar from './PeriodBar'
import LineChart, { type LineSeries } from './LineChart'
import CashflowBarChart from './CashflowBarChart'
import DonutChart from './DonutChart'
import OpeningBalanceSheet from './OpeningBalanceSheet'
import { barBuckets, resolvePeriod, stepAnchor, type CustomRange, type Granularity } from './period'
import {
  balanceSeries,
  cashflowByBucket,
  categoryBreakdown,
  labelBreakdown,
  lastStartedIndex,
  sumFlow,
  type Slice,
} from './compute'

/** Earliest of several ISO date strings, ignoring empty ones (settings that
 * aren't set yet). */
function earliestOf(...dates: string[]): string {
  const real = dates.filter(Boolean)
  return real.length ? real.reduce((m, d) => (d < m ? d : m)) : ''
}

type View = 'overview' | 'categories' | 'labels'

function alignLen(arr: number[], len: number): Array<number | null> {
  if (arr.length >= len) return arr.slice(0, len)
  return [...arr, ...Array(len - arr.length).fill(null)]
}

export default function InsightsScreen() {
  const allStart = useEarliestTransactionDate()
  const categoryMap = useCategoryMap()
  const settings = useSettings()
  const base = settings.baseCurrency

  const [view, setView] = useState<View>('overview')
  const [granularity, setGranularity] = useState<Granularity>('year')
  const [anchor, setAnchor] = useState(() => new Date())
  const [custom, setCustom] = useState<CustomRange>(() => ({
    from: toISO(addDays(new Date(), -29)),
    to: todayISO(),
  }))
  const [flow, setFlow] = useState<TxType>('expense')
  const [metric, setMetric] = useState<'wealth' | 'cashflow'>('wealth')
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [obOpen, setObOpen] = useState(false)

  const period = useMemo(
    () => resolvePeriod(granularity, anchor, custom, settings.firstDayOfWeek, allStart),
    [granularity, anchor, custom, settings.firstDayOfWeek, allStart],
  )

  // The wealth chart's running balance needs everything back to the opening
  // balance date (or the very first transaction, if that's not set) to be
  // correct — not just the viewed period — so the fetch is widened to cover
  // whichever of those three points is earliest, rather than loading every
  // transaction ever recorded.
  const fetchStart = earliestOf(period.startISO, settings.openingBalanceDate, allStart)
  const all = useTransactionsInRange(fetchStart, period.endISO)

  const periodTxs = useMemo(
    () => all.filter((t) => t.date >= period.startISO && t.date <= period.endISO),
    [all, period],
  )

  const totalExpense = useMemo(() => sumFlow(periodTxs, 'expense'), [periodTxs])
  const totalIncome = useMemo(() => sumFlow(periodTxs, 'income'), [periodTxs])
  const net = totalIncome - totalExpense

  /* ----------------------------- Wealth series ---------------------------- */
  const today = todayISO()
  const lastIdx = lastStartedIndex(period.buckets, today)
  const nBuckets = period.buckets.length
  const hasOpening = settings.openingBalance !== 0 || settings.openingBalanceDate !== ''

  // Always computed regardless of which tab is active — the "Total Wealth"
  // mini-stat shows real current net worth even while viewing the cash-flow
  // chart, so it can't be derived from whichever series that tab happens to use.
  const wealth = useMemo(() => {
    const raw = balanceSeries(all, period.buckets, settings.openingBalance, settings.openingBalanceDate)
    const cur = raw.map((v, i) => (i <= lastIdx ? v : null))
    const prev = period.prev
      ? alignLen(
          balanceSeries(all, period.prev.buckets, settings.openingBalance, settings.openingBalanceDate),
          nBuckets,
        )
      : null
    const now = lastIdx >= 0 ? raw[lastIdx] : (raw[raw.length - 1] ?? settings.openingBalance)
    return { cur, prev, now }
  }, [all, period, settings.openingBalance, settings.openingBalanceDate, lastIdx, nBuckets])

  const wealthSeries: LineSeries[] = useMemo(() => {
    const nameCur =
      granularity === 'year' ? period.label : granularity === 'all' ? 'All time' : 'Current'
    const out: LineSeries[] = [
      { name: nameCur, points: wealth.cur, color: 'rgb(var(--c-income))', fill: true, dot: true },
    ]
    if (wealth.prev) {
      out.push({
        name: granularity === 'year' && period.prev ? period.prev.label : 'Previous',
        points: wealth.prev,
        color: 'rgb(var(--c-muted))',
        dashed: true,
      })
    }
    return out
  }, [wealth, granularity, period])

  /* ---------------------------- Cash flow bars ---------------------------- */
  // Its own (coarser, for the year view) bucket resolution so bars stay
  // legible — see barBuckets() — rather than reusing the wealth line's
  // finer weekly checkpoints.
  const cfBuckets = useMemo(() => barBuckets(period), [period])
  const cfLastIdx = lastStartedIndex(cfBuckets, today)
  const cashflow = useMemo(() => cashflowByBucket(periodTxs, cfBuckets), [periodTxs, cfBuckets])

  /* ----------------------------- Breakdowns ------------------------------ */
  const catSlices = useMemo(
    () => categoryBreakdown(periodTxs, flow, categoryMap),
    [periodTxs, flow, categoryMap],
  )
  const labelSlices = useMemo(
    () => labelBreakdown(periodTxs, flow, categoryPalette(settings.appTheme)),
    [periodTxs, flow, settings.appTheme],
  )
  const flowTotal = flow === 'expense' ? totalExpense : totalIncome
  const selected = selectedCat ? catSlices.find((s) => s.key === selectedCat) : undefined
  const selectedLbl = selectedLabel ? labelSlices.find((s) => s.key === selectedLabel) : undefined

  const step = (dir: -1 | 1) => setAnchor((a) => stepAnchor(granularity, a, dir))

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top">
        <div className="mx-4 mt-2 rounded-[22px] bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-bold">Insights</h1>
          <span className="text-xs text-muted">in {base}</span>
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'categories', label: 'Categories' },
            { value: 'labels', label: 'Labels' },
          ]}
          value={view}
          onChange={(v) => {
            setView(v)
            setSelectedCat(null)
            setSelectedLabel(null)
          }}
        />
        <PeriodBar
          granularity={granularity}
          onGranularity={(g) => {
            setGranularity(g)
            setAnchor(new Date())
          }}
          label={period.label}
          canGoNext={period.canGoNext}
          onStep={step}
          custom={custom}
          onCustom={setCustom}
        />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3">
        {periodTxs.length === 0 && view !== 'overview' ? (
          <EmptyState />
        ) : view === 'overview' ? (
          <OverviewView
            metric={metric}
            setMetric={setMetric}
            wealthNow={wealth.now}
            net={net}
            income={totalIncome}
            expense={totalExpense}
            base={base}
            wealthSeries={wealthSeries}
            wealthLabels={period.buckets.map((b) => b.label)}
            cashflowIncome={cashflow.income}
            cashflowExpense={cashflow.expense}
            cashflowNet={cashflow.net}
            cashflowLabels={cfBuckets.map((b) => b.label)}
            cashflowLastIdx={cfLastIdx}
            hasOpening={hasOpening}
            onEditOpening={() => setObOpen(true)}
            empty={periodTxs.length === 0}
            periodFrom={period.startISO}
            periodTo={period.endISO}
          />
        ) : view === 'categories' ? (
          <BreakdownView
            kind="category"
            flow={flow}
            setFlow={setFlow}
            slices={catSlices}
            total={flowTotal}
            base={base}
            selectedKey={selectedCat}
            onSelect={setSelectedCat}
            selected={selected}
            periodFrom={period.startISO}
            periodTo={period.endISO}
          />
        ) : (
          <BreakdownView
            kind="label"
            flow={flow}
            setFlow={setFlow}
            slices={labelSlices}
            total={flowTotal}
            base={base}
            selectedKey={selectedLabel}
            onSelect={setSelectedLabel}
            selected={selectedLbl}
            periodFrom={period.startISO}
            periodTo={period.endISO}
          />
        )}
      </div>

      <OpeningBalanceSheet
        open={obOpen}
        onClose={() => setObOpen(false)}
        baseCurrency={base}
        openingBalance={settings.openingBalance}
        openingBalanceDate={settings.openingBalanceDate}
        earliestDate={allStart}
      />
    </div>
  )
}

/* -------------------------------- Overview ------------------------------- */

function OverviewView({
  metric,
  setMetric,
  wealthNow,
  net,
  income,
  expense,
  base,
  wealthSeries,
  wealthLabels,
  cashflowIncome,
  cashflowExpense,
  cashflowNet,
  cashflowLabels,
  cashflowLastIdx,
  hasOpening,
  onEditOpening,
  empty,
  periodFrom,
  periodTo,
}: {
  metric: 'wealth' | 'cashflow'
  setMetric: (m: 'wealth' | 'cashflow') => void
  wealthNow: number
  net: number
  income: number
  expense: number
  base: string
  wealthSeries: LineSeries[]
  wealthLabels: string[]
  cashflowIncome: number[]
  cashflowExpense: number[]
  cashflowNet: number[]
  cashflowLabels: string[]
  cashflowLastIdx: number
  hasOpening: boolean
  onEditOpening: () => void
  empty: boolean
  periodFrom: string
  periodTo: string
}) {
  const navigate = useNavigate()
  const openInActivity = (type: TxType) => {
    const params = new URLSearchParams()
    params.set('type', type)
    params.set('from', periodFrom)
    params.set('to', periodTo)
    navigate(`/transactions?${params.toString()}`)
  }
  return (
    <>
      <div className="grid grid-cols-2 overflow-hidden rounded-[22px] border border-border">
        <button
          onClick={() => setMetric('wealth')}
          className={cn('p-3 text-left', metric === 'wealth' ? 'bg-surface' : 'bg-transparent')}
        >
          <span className="flex items-center gap-1 text-xs text-muted">
            Total Wealth
            <PencilIcon
              size={12}
              className="text-muted"
              onClick={(e) => {
                e.stopPropagation()
                onEditOpening()
              }}
            />
          </span>
          <span className="mt-0.5 block truncate text-lg font-bold text-income">
            {formatMoneyCompact(wealthNow, base)}
          </span>
        </button>
        <button
          onClick={() => setMetric('cashflow')}
          className={cn(
            'border-l border-border p-3 text-left',
            metric === 'cashflow' ? 'bg-surface' : 'bg-transparent',
          )}
        >
          <span className="text-xs text-muted">Cash flow</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-lg font-bold',
              net < 0 ? 'text-expense' : 'text-income',
            )}
          >
            {formatMoneyCompact(net, base)}
          </span>
        </button>
      </div>

      {metric === 'wealth' && !hasOpening && (
        <button
          onClick={onEditOpening}
          className="mt-3 w-full rounded-xl border border-dashed border-border px-3 py-2 text-left text-xs text-muted"
        >
          Set an <span className="font-semibold text-content">opening balance</span> to track real
          net worth. Right now this shows cumulative income minus expenses.
        </button>
      )}

      <div className="mt-4 rounded-[22px] bg-surface p-4">
        {empty ? (
          <p className="py-12 text-center text-sm text-muted">No activity in this period.</p>
        ) : metric === 'wealth' ? (
          <LineChart
            series={wealthSeries}
            labels={wealthLabels}
            formatY={(n) => formatMoneyCompact(n, base)}
          />
        ) : (
          <CashflowBarChart
            income={cashflowIncome}
            expense={cashflowExpense}
            net={cashflowNet}
            labels={cashflowLabels}
            lastIdx={cashflowLastIdx}
            formatY={(n) => formatMoneyCompact(n, base)}
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MiniStat
          label="Income"
          value={formatMoney(income, base)}
          tone="income"
          onClick={() => openInActivity('income')}
        />
        <MiniStat
          label="Expenses"
          value={formatMoney(expense, base)}
          tone="expense"
          onClick={() => openInActivity('expense')}
        />
      </div>
    </>
  )
}

function MiniStat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: string
  tone: 'income' | 'expense'
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="rounded-[22px] bg-surface p-3 text-left active:scale-[0.98]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-0.5 truncate text-base font-bold tabular-nums', tone === 'income' ? 'text-income' : 'text-expense')}>
        {value}
      </p>
    </button>
  )
}

/* ------------------------- Categories / Labels -------------------------- */

function BreakdownView({
  kind,
  flow,
  setFlow,
  slices,
  total,
  base,
  selectedKey,
  onSelect,
  selected,
  periodFrom,
  periodTo,
}: {
  kind: 'category' | 'label'
  flow: TxType
  setFlow: (f: TxType) => void
  slices: Slice[]
  total: number
  base: string
  selectedKey: string | null
  onSelect: (k: string | null) => void
  selected?: Slice
  periodFrom: string
  periodTo: string
}) {
  const navigate = useNavigate()
  const maxVal = slices.length ? slices[0].value : 0
  const sign = flow === 'expense' ? '-' : ''
  // Drill into the transactions behind a row: same category/label, same
  // flow, and the timeframe currently selected on this screen.
  const openInActivity = (s: Slice) => {
    const params = new URLSearchParams()
    params.set('type', flow)
    if (kind === 'category') params.set('categoryId', s.key)
    else params.set('tag', s.name)
    params.set('from', periodFrom)
    params.set('to', periodTo)
    navigate(`/transactions?${params.toString()}`)
  }
  // Tapping a slice on the donut should surface its row at the top of the
  // list below, without touching the donut's own (value-sorted) arc order.
  const orderedSlices = useMemo(() => {
    if (!selectedKey) return slices
    const idx = slices.findIndex((s) => s.key === selectedKey)
    if (idx <= 0) return slices
    const copy = slices.slice()
    const [sel] = copy.splice(idx, 1)
    copy.unshift(sel)
    return copy
  }, [slices, selectedKey])

  return (
    <>
      <div className="flex justify-center">
        <Segmented
          options={[
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
          ]}
          value={flow}
          onChange={(v) => {
            setFlow(v)
            onSelect(null)
          }}
          activeClass={cn('text-white shadow', flow === 'expense' ? 'bg-expense' : 'bg-income')}
        />
      </div>

      {slices.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          No {flow === 'expense' ? 'expenses' : 'income'} {kind === 'label' ? 'with tags ' : ''}in
          this period.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <DonutChart
              slices={slices.map((s) => ({
                key: s.key,
                label: s.name,
                value: s.value,
                color: s.color,
                icon: s.icon ?? (kind === 'label' ? '#' : undefined),
              }))}
              total={total}
              centerLabel={selected ? (kind === 'label' ? '#' + selected.name : selected.name) : 'Total'}
              centerValue={formatMoneyCompact(selected ? selected.value : total, base)}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          </div>

          <div className="mt-4 space-y-1">
            {orderedSlices.map((s, i) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0
              const on = selectedKey === s.key
              return (
                <Fragment key={s.key}>
                  <button
                    onClick={() => {
                      onSelect(s.key)
                      openInActivity(s)
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left',
                      on ? 'bg-surface2' : 'hover:bg-surface2/60',
                    )}
                  >
                    <span
                      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-base"
                      style={{ backgroundColor: kind === 'category' ? s.color + '22' : s.color + '22' }}
                    >
                      {kind === 'category' ? (
                        s.icon
                      ) : (
                        <TagIcon size={16} style={{ color: s.color }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {kind === 'label' ? '#' + s.name : s.name}
                        </span>
                        <span
                          className={cn(
                            'flex-shrink-0 text-sm font-semibold tabular-nums',
                            flow === 'expense' ? 'text-expense' : 'text-income',
                          )}
                        >
                          {sign}
                          {formatMoney(s.value, base)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${maxVal > 0 ? (s.value / maxVal) * 100 : 0}%`, backgroundColor: s.color }}
                          />
                        </span>
                        <span className="w-16 flex-shrink-0 text-right text-[11px] text-muted">
                          {s.count} tx · {pct.toFixed(0)}%
                        </span>
                      </span>
                    </span>
                    <ChevronRightIcon size={16} className="flex-shrink-0 text-muted/50" />
                  </button>
                  {/* Separates the tapped-to-top category from the rest so the
                      reorder reads as a deliberate promotion, not a shuffle. */}
                  {i === 0 && selectedKey && orderedSlices.length > 1 && (
                    <div className="my-2 border-t border-border" />
                  )}
                </Fragment>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl">📊</p>
      <p className="mt-3 text-sm text-muted">No transactions in this period.</p>
    </div>
  )
}
