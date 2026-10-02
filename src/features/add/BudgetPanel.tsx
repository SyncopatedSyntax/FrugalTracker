import { memo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBudgets, useCategoryMap, useSettings, useTransactionsInRange } from '@/hooks'
import type { TxType } from '@/db/types'
import { formatMoneyCompact } from '@/lib/currency'
import { toISO, todayISO } from '@/lib/date'
import { cn } from '@/lib/cn'
import { InfoIcon } from '@/components/icons'
import BudgetInfoSheet, { type RingBasis } from './BudgetInfoSheet'
import { ExpenseRingCard, IncomeRingCard } from './BudgetRingCard'
import {
  periodRange,
  prorateMonthly,
  prorationParts,
  rollingMonthlyAverage,
  sameRangeLastYear,
  sumInRange,
  type Timeframe,
} from '@/lib/budgetMath'

const TIMEFRAMES: Timeframe[] = ['week', 'month', 'year']
const TF_LABELS: Record<Timeframe, string> = { week: 'Week', month: 'Month', year: 'Year' }

interface Props {
  type: TxType
  categoryId: string | null
}

function BudgetPanel({ type, categoryId }: Props) {
  const settings = useSettings()
  const base = settings.baseCurrency
  // Every ring here — this year's/last year's week, month, or year to date,
  // plus the trailing-12-month rolling average — falls within "start of last
  // calendar year through today," so that's all this needs to fetch rather
  // than the whole table.
  const rangeStart = toISO(new Date(new Date().getFullYear() - 1, 0, 1))
  const txs = useTransactionsInRange(rangeStart, todayISO())
  const budgets = useBudgets()
  const categoryMap = useCategoryMap()

  return (
    <div className="mx-4 mt-2 rounded-[1.375rem] bg-surface p-5">
      {type === 'income' ? (
        <IncomeCompare txs={txs} base={base} firstDayOfWeek={settings.firstDayOfWeek} />
      ) : (
        <ExpenseCompare
          categoryId={categoryId}
          txs={txs}
          budgets={budgets}
          categoryMap={categoryMap}
          base={base}
          firstDayOfWeek={settings.firstDayOfWeek}
        />
      )}
    </div>
  )
}

export default memo(BudgetPanel)

/** Ring color: healthy/neutral in `base`, ramps to amber near the limit, red
 * once over — except for income, where reaching/exceeding last year is the
 * good outcome, so it lands on the income color instead of red. */
function ringColor(ratio: number, hasComparison: boolean, base: string, isIncome: boolean): string {
  if (!hasComparison) return 'rgb(var(--c-border))'
  if (isIncome) return ratio >= 1 ? 'rgb(var(--c-income))' : base
  if (ratio > 1) return 'rgb(var(--c-expense))'
  if (ratio >= 0.8) return '#D1A54E'
  return base
}

function ExpenseCompare({
  categoryId,
  txs,
  budgets,
  categoryMap,
  base,
  firstDayOfWeek,
}: {
  categoryId: string | null
  txs: ReturnType<typeof useTransactionsInRange>
  budgets: ReturnType<typeof useBudgets>
  categoryMap: ReturnType<typeof useCategoryMap>
  base: string
  firstDayOfWeek: 0 | 1
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [openTf, setOpenTf] = useState<Timeframe | null>(null)
  const navigate = useNavigate()
  const now = new Date()
  const category = categoryId ? categoryMap.get(categoryId) : undefined
  const budget = budgets.find((b) => b.categoryId === categoryId)

  let monthly = 0
  let isAvg = false
  let hasComparison = true
  if (budget) {
    monthly = budget.amount
  } else {
    const avg = rollingMonthlyAverage(txs, categoryId, now)
    if (avg > 0) {
      monthly = avg
      isAvg = true
    } else {
      hasComparison = false
    }
  }

  const categoryColor = category?.color ?? 'rgb(var(--c-primary))'
  const parts = prorationParts(now, firstDayOfWeek)
  const rings = TIMEFRAMES.map((tf) => {
    const range = periodRange(tf, now, firstDayOfWeek)
    const spent = sumInRange(txs, range, 'expense', categoryId)
    const target = hasComparison ? prorateMonthly(monthly, tf, now, firstDayOfWeek) : 0
    const ratio = target > 0 ? spent / target : 0
    return { tf, spent, target, ratio, range }
  })
  const openRing = openTf ? rings.find((r) => r.tf === openTf) : undefined
  const scope = category ? category.name : 'All categories'

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-xl"
          style={{ backgroundColor: (category?.color ?? '#767B70') + '22' }}
        >
          {category ? category.icon : '💰'}
        </span>
        <span className="flex-1 truncate text-lg font-bold">
          {category ? category.name : 'All categories'}
        </span>
        {hasComparison && (
          <button
            type="button"
            onClick={() => navigate('/more/budgets')}
            aria-label="View budgets"
            className="flex-shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted active:scale-95"
          >
            {isAvg ? 'Avg · 12mo' : 'Budget'}
          </button>
        )}
        <InfoButton onClick={() => setInfoOpen(true)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {rings.map(({ tf, spent, target, ratio }) => (
          <RingStat
            key={tf}
            label={TF_LABELS[tf]}
            ratio={ratio}
            color={ringColor(ratio, hasComparison, categoryColor, false)}
            over={hasComparison && ratio > 1}
            caption={
              hasComparison
                ? `${formatMoneyCompact(spent, base)}/${formatMoneyCompact(target, base)}`
                : formatMoneyCompact(spent, base)
            }
            pct={hasComparison ? Math.round(ratio * 100) : null}
            selected={openTf === tf}
            onClick={() => setOpenTf((cur) => (cur === tf ? null : tf))}
          />
        ))}
      </div>

      {openRing && (
        <ExpenseRingCard
          timeframe={openRing.tf}
          spent={openRing.spent}
          target={openRing.target}
          monthly={monthly}
          basis={hasComparison ? (isAvg ? 'average' : 'budget') : 'none'}
          scope={scope}
          base={base}
          parts={parts}
          range={openRing.range}
          onClose={() => setOpenTf(null)}
          onOpenBudgets={() => navigate('/more/budgets')}
        />
      )}

      {!hasComparison && (
        <p className="mt-3 text-center text-xs text-muted">
          No budget or spending history to compare yet
        </p>
      )}

      <BudgetInfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        mode="expense"
        basis={(hasComparison ? (isAvg ? 'average' : 'budget') : 'none') as RingBasis}
        monthly={monthly}
        base={base}
        scope={scope}
      />
    </div>
  )
}

function IncomeCompare({
  txs,
  base,
  firstDayOfWeek,
}: {
  txs: ReturnType<typeof useTransactionsInRange>
  base: string
  firstDayOfWeek: 0 | 1
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [openTf, setOpenTf] = useState<Timeframe | null>(null)
  const now = new Date()
  const rings = TIMEFRAMES.map((tf) => {
    const range = periodRange(tf, now, firstDayOfWeek)
    const lastRange = sameRangeLastYear(range)
    const current = sumInRange(txs, range, 'income', null)
    const lastYear = sumInRange(txs, lastRange, 'income', null)
    const hasLastYear = lastYear > 0
    const ratio = hasLastYear ? current / lastYear : 0
    return { tf, current, lastYear, hasLastYear, ratio, range, lastRange }
  })
  const openRing = openTf ? rings.find((r) => r.tf === openTf) : undefined
  const noHistory = rings.every((r) => !r.hasLastYear)

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-income/15 text-xl">
          💵
        </span>
        <span className="flex-1 truncate text-lg font-bold">Income</span>
        <span className="flex-shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
          vs last year
        </span>
        <InfoButton onClick={() => setInfoOpen(true)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {rings.map(({ tf, current, hasLastYear, ratio }) => (
          <RingStat
            key={tf}
            label={TF_LABELS[tf]}
            ratio={ratio}
            color={ringColor(ratio, hasLastYear, 'rgb(var(--c-primary))', true)}
            over={hasLastYear && ratio >= 1}
            overClass="text-income"
            caption={formatMoneyCompact(current, base)}
            pct={hasLastYear ? Math.round(ratio * 100) : null}
            selected={openTf === tf}
            onClick={() => setOpenTf((cur) => (cur === tf ? null : tf))}
          />
        ))}
      </div>

      {openRing && (
        <IncomeRingCard
          timeframe={openRing.tf}
          current={openRing.current}
          lastYear={openRing.lastYear}
          hasLastYear={openRing.hasLastYear}
          range={openRing.range}
          lastRange={openRing.lastRange}
          base={base}
          onClose={() => setOpenTf(null)}
        />
      )}

      {noHistory && (
        <p className="mt-3 text-center text-xs text-muted">
          No income recorded this time last year
        </p>
      )}

      <BudgetInfoSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        mode="income"
        base={base}
      />
    </div>
  )
}

/** The rings show a bare percentage against a target that is never spelled
 * out on screen, so each panel carries its own "what is this measuring?"
 * affordance rather than relying on the user to find an explanation. */
function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="How these rings work"
      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-muted active:scale-95"
    >
      <InfoIcon size={18} />
    </button>
  )
}

function RingStat({
  label,
  ratio,
  color,
  over,
  overClass = 'text-expense',
  caption,
  pct,
  selected,
  onClick,
}: {
  label: string
  ratio: number
  color: string
  over: boolean
  overClass?: string
  caption: string
  pct: number | null
  selected: boolean
  onClick: () => void
}) {
  // The whole stat is the target, not just the circle — the number underneath
  // is as likely to be what someone taps to ask "what is this measuring?".
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: explain this figure`}
      aria-expanded={selected}
      className={cn(
        'flex min-w-0 flex-col items-center rounded-xl py-1 active:scale-[0.98]',
        selected && 'bg-surface2',
      )}
    >
      <ProgressRing ratio={ratio} color={color}>
        <span className={cn('text-lg font-bold tabular-nums sm:text-xl', over && overClass)}>
          {pct === null ? '–' : `${pct}%`}
        </span>
      </ProgressRing>
      <span className={cn('mt-2 text-xs font-semibold', selected ? 'text-content' : 'text-muted')}>
        {label}
      </span>
      <span className="mt-0.5 max-w-full truncate text-xs tabular-nums text-muted">{caption}</span>
    </button>
  )
}

/**
 * A circular meter that scales to its cell (with a max cap so it never gets
 * oversized on wide layouts). Ratios beyond 1 still render as a full, capped
 * ring in the "over" status color — it never wraps into a confusing second
 * lap — while the center label (the true, uncapped percentage) is what
 * communicates how far over.
 */
function ProgressRing({
  ratio,
  color,
  children,
}: {
  ratio: number
  color: string
  children: ReactNode
}) {
  const S = 100
  const stroke = 8
  const r = (S - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = Math.min(Math.max(ratio, 0), 1) * c
  return (
    <div className="relative aspect-square w-full max-w-[116px]">
      <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full">
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="rgb(var(--c-surface2))" strokeWidth={stroke} />
        <circle
          cx={S / 2}
          cy={S / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${S / 2} ${S / 2})`}
          className="transition-all"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
