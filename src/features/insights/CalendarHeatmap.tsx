import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import TransactionRow from '@/features/transactions/TransactionRow'
import { useCategoryMap, useSettings, useTransactionsInRange } from '@/hooks'
import { formatMoney } from '@/lib/currency'
import {
  addMonths,
  endOfMonth,
  formatShortDate,
  monthLabel,
  startOfMonth,
  toISO,
  todayISO,
} from '@/lib/date'
import { alphaHex } from '@/lib/palette'
import { cn } from '@/lib/cn'
import { dailyTotals } from './compute'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Calendar month whose day cells are shaded by that day's expense total — a
 * heat map for "which days did I spend, and how much". Tapping a day reveals
 * its transactions below the grid. Navigates by month; independent of the
 * screen's Week/Year/etc period selector (hidden while this view is active). */
export default function CalendarHeatmap({ base }: { base: string }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const categoryMap = useCategoryMap()
  const chipAlpha = alphaHex(settings.categoryIconAlpha)
  const first = settings.firstDayOfWeek // 0 = Sun, 1 = Mon

  const today = todayISO()
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))

  const monthStart = toISO(anchor)
  const monthEnd = toISO(endOfMonth(anchor))
  const txs = useTransactionsInRange(monthStart, monthEnd)
  const days = useMemo(() => dailyTotals(txs, anchor), [txs, anchor])
  const maxExpense = useMemo(() => Math.max(0, ...days.map((d) => d.expense)), [days])
  const monthExpense = useMemo(() => days.reduce((s, d) => s + d.expense, 0), [days])

  // Default the selected day to today when this month contains it, else none.
  const [selected, setSelected] = useState<string | null>(() =>
    today.slice(0, 7) === monthStart.slice(0, 7) ? today : null,
  )

  const canNext = toISO(startOfMonth(anchor)) < toISO(startOfMonth(new Date()))
  const stepMonth = (dir: -1 | 1) => {
    const next = startOfMonth(addMonths(anchor, dir))
    setAnchor(next)
    const nISO = toISO(next)
    setSelected(today.slice(0, 7) === nISO.slice(0, 7) ? today : null)
  }

  // Weekday header + leading blanks, rotated to honor firstDayOfWeek.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + first) % 7])
  const firstDow = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay()
  const leadingBlanks = (firstDow - first + 7) % 7

  const selectedDay = selected ? days.find((d) => d.iso === selected) : undefined
  const selectedTxs = useMemo(
    () => (selected ? txs.filter((t) => t.date === selected) : []),
    [txs, selected],
  )

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => stepMonth(-1)}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2"
          aria-label="Previous month"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <div className="text-center">
          <p className="text-base font-semibold">{monthLabel(anchor)}</p>
          <p className="text-xs text-muted">{formatMoney(monthExpense, base)} spent</p>
        </div>
        <button
          onClick={() => stepMonth(1)}
          disabled={!canNext}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      <div className="rounded-[1.375rem] bg-surface p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {weekdayLabels.map((w, i) => (
            <div key={i} className="text-center text-[0.625rem] font-semibold uppercase text-muted">
              {w[0]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((d) => {
            const frac = maxExpense > 0 ? d.expense / maxExpense : 0
            // A floor so any non-zero day is visibly tinted, scaling up to a
            // near-solid cell for the month's heaviest spend.
            const alpha = d.expense > 0 ? 0.18 + 0.82 * frac : 0
            const isToday = d.iso === today
            const isSel = d.iso === selected
            const isFuture = d.iso > today
            return (
              <button
                key={d.iso}
                onClick={() => setSelected(d.iso)}
                className={cn(
                  'relative grid aspect-square place-items-center rounded-lg text-xs tabular-nums transition-transform active:scale-95',
                  isFuture ? 'text-muted/40' : frac > 0.55 ? 'font-semibold text-white' : 'text-content',
                  isSel && 'ring-2 ring-primary',
                  isToday && !isSel && 'ring-1 ring-muted',
                )}
                style={{
                  backgroundColor:
                    d.expense > 0
                      ? `rgb(var(--c-expense) / ${alpha})`
                      : 'rgb(var(--c-surface2) / 0.5)',
                }}
              >
                {d.day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected-day detail */}
      {selected && (
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between px-1">
            <p className="text-sm font-semibold">
              {selected === today ? 'Today' : formatShortDate(selected)}
            </p>
            <p className="text-sm font-bold tabular-nums text-expense">
              {selectedDay && selectedDay.expense > 0 ? '-' + formatMoney(selectedDay.expense, base) : '—'}
            </p>
          </div>
          {selectedTxs.length === 0 ? (
            <p className="rounded-[1.375rem] bg-surface py-6 text-center text-xs text-muted">
              Nothing recorded on this day.
            </p>
          ) : (
            <div className="overflow-hidden rounded-[1.375rem] bg-surface">
              {selectedTxs.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  category={categoryMap.get(t.categoryId)}
                  base={base}
                  chipAlpha={chipAlpha}
                  onClick={() => navigate(`/tx/${t.id}/edit`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
