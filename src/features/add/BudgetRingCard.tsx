import { XIcon } from '@/components/icons'
import { formatMoney } from '@/lib/currency'
import { formatShortDate } from '@/lib/date'
import type { ProrationParts, Range, Timeframe } from '@/lib/budgetMath'

const TITLES: Record<Timeframe, string> = {
  week: 'This week so far',
  month: 'This month so far',
  year: 'This year so far',
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface2 p-3 shadow-xl">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-muted active:scale-95"
        >
          <XIcon size={16} />
        </button>
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="min-w-0 text-xs text-muted">
        {label}
        {sub && <span className="block text-[0.6875rem] text-muted/70">{sub}</span>}
      </span>
      <span className="flex-shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/** The arithmetic behind one expense ring, with this ring's own numbers
 * substituted in — the panel otherwise shows a bare percentage against a
 * target it never explains, which is what made a reading like 478% look
 * alarming rather than "you are early in the month". */
export function ExpenseRingCard({
  timeframe,
  spent,
  target,
  monthly,
  basis,
  scope,
  base,
  parts,
  range,
  onClose,
  onOpenBudgets,
}: {
  timeframe: Timeframe
  spent: number
  target: number
  monthly: number
  /** 'none' when there is neither a budget nor enough history to average. */
  basis: 'budget' | 'average' | 'none'
  scope: string
  base: string
  parts: ProrationParts
  range: Range
  onClose: () => void
  onOpenBudgets: () => void
}) {
  if (basis === 'none') {
    return (
      <Shell title={TITLES[timeframe]} onClose={onClose}>
        <Row label="Spent" sub={`since ${formatShortDate(range.startISO)}`} value={formatMoney(spent, base)} />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          There is nothing to measure that against yet. This ring compares your spending against a
          monthly figure — a budget you set, or your own average once you have a month or two of
          history in {scope} — so until one exists it shows a dash instead of a percentage.
        </p>
        <button
          type="button"
          onClick={onOpenBudgets}
          className="mt-2 w-full rounded-lg bg-surface px-2.5 py-2 text-left text-[0.6875rem] font-semibold text-content active:scale-[0.99]"
        >
          Set a budget ›
        </button>
      </Shell>
    )
  }

  const m = formatMoney(monthly, base)
  const { daysInCurrentMonth: dim, dayOfMonth, elapsedWeekDays, fullMonthsElapsed } = parts
  const formula =
    timeframe === 'week'
      ? `${m} × ${elapsedWeekDays} of ${dim} days`
      : timeframe === 'month'
        ? `${m} × ${dayOfMonth} of ${dim} days`
        : `${m} × (${fullMonthsElapsed} ${fullMonthsElapsed === 1 ? 'month' : 'months'} + ${dayOfMonth} of ${dim} days)`
  const pct = target > 0 ? Math.round((spent / target) * 100) : null

  return (
    <Shell title={TITLES[timeframe]} onClose={onClose}>
      <Row label="Spent" sub={`since ${formatShortDate(range.startISO)}`} value={formatMoney(spent, base)} />
      <Row label="Should have spent by now" value={formatMoney(target, base)} />

      <div className="mt-2 rounded-lg bg-surface px-2.5 py-2">
        <p className="text-[0.6875rem] leading-relaxed text-muted">
          <span className="tabular-nums">{formula}</span> = {formatMoney(target, base)}
          {timeframe === 'week' && (
            <>
              <br />
              Counted in days of this month, because the figure it scales is a monthly one.
            </>
          )}
        </p>
      </div>

      {pct !== null && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="tabular-nums">
            {formatMoney(spent, base)} ÷ {formatMoney(target, base)}
          </span>{' '}
          = <span className="font-semibold text-content">{pct}%</span>
          {pct > 100 && ' — more than the pace allows this far in.'}
        </p>
      )}

      <button
        type="button"
        onClick={onOpenBudgets}
        className="mt-2 w-full rounded-lg bg-surface px-2.5 py-2 text-left text-[0.6875rem] leading-relaxed text-muted active:scale-[0.99]"
      >
        {basis === 'budget' ? (
          <>
            Based on your <span className="font-semibold text-content">{m} a month</span> budget for {scope}.
          </>
        ) : (
          <>
            No budget set for {scope}, so this uses what you normally spend:{' '}
            <span className="font-semibold text-content">{m} a month</span>, averaged over the last 12
            complete months.
          </>
        )}{' '}
        <span className="font-semibold text-content">View budgets ›</span>
      </button>
    </Shell>
  )
}

/** Income has no budget behind it, so its rings compare against the same
 * stretch of last year instead. */
export function IncomeRingCard({
  timeframe,
  current,
  lastYear,
  hasLastYear,
  range,
  lastRange,
  base,
  onClose,
}: {
  timeframe: Timeframe
  current: number
  lastYear: number
  hasLastYear: boolean
  range: Range
  lastRange: Range
  base: string
  onClose: () => void
}) {
  const pct = hasLastYear ? Math.round((current / lastYear) * 100) : null
  return (
    <Shell title={TITLES[timeframe]} onClose={onClose}>
      <Row
        label="Earned"
        sub={`since ${formatShortDate(range.startISO)}`}
        value={formatMoney(current, base)}
      />
      <Row
        label="Same stretch last year"
        sub={`${formatShortDate(lastRange.startISO)} – ${formatShortDate(lastRange.endISO)}`}
        value={hasLastYear ? formatMoney(lastYear, base) : '—'}
      />

      {pct !== null ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="tabular-nums">
            {formatMoney(current, base)} ÷ {formatMoney(lastYear, base)}
          </span>{' '}
          = <span className="font-semibold text-content">{pct}%</span>. Both ends of the range shift
          back exactly one year, so it is a like-for-like stretch. Here more is better, so 100% or
          over turns the ring green.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          No income was recorded in that stretch last year, so there is nothing to compare against
          and the ring shows a dash.
        </p>
      )}
    </Shell>
  )
}
