import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Segmented from '@/components/Segmented'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import TransactionRow from '@/features/transactions/TransactionRow'
import { useCategoryMap, useSettings, useTransactionsInRange } from '@/hooks'
import { formatMoney } from '@/lib/currency'
import {
  addMonths,
  endOfMonth,
  formatShortDate,
  monthLabel,
  monthShort,
  startOfMonth,
  toISO,
  todayISO,
} from '@/lib/date'
import { alphaHex } from '@/lib/palette'
import { cn } from '@/lib/cn'
import { dailyTotals, type DayTotal } from './compute'

type Zoom = 'month' | 'quarter' | 'year'

/** Calendar whose day cells are shaded by that day's expense total — a heat
 * map for "which days did I spend, and how much". Month view keeps day
 * numbers and taps through to a day's transactions; Quarter (3 months) and
 * Year (12 months) show compact heat-only grids side by side with one shared
 * colour scale, so months are directly comparable. Tapping any day, at any
 * zoom, reveals its transactions below. Navigates by the current zoom;
 * independent of the screen's Week/Year period selector (hidden here). */
export default function CalendarHeatmap({ base }: { base: string }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const categoryMap = useCategoryMap()
  const chipAlpha = alphaHex(settings.categoryIconAlpha)
  const first = settings.firstDayOfWeek // 0 = Sun, 1 = Mon

  const today = todayISO()
  const [zoom, setZoom] = useState<Zoom>('month')
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string | null>(today)

  // The months shown for the current zoom (each the 1st of its month).
  const months = useMemo(() => {
    if (zoom === 'month') return [anchor]
    if (zoom === 'quarter') {
      const q = Math.floor(anchor.getMonth() / 3) * 3
      const start = new Date(anchor.getFullYear(), q, 1)
      return [0, 1, 2].map((i) => addMonths(start, i))
    }
    return Array.from({ length: 12 }, (_, i) => new Date(anchor.getFullYear(), i, 1))
  }, [zoom, anchor])

  const rangeStart = toISO(months[0])
  const rangeEnd = toISO(endOfMonth(months[months.length - 1]))
  const txs = useTransactionsInRange(rangeStart, rangeEnd)

  // Per-month day totals, plus the max daily expense across the whole visible
  // range — the shared scale that makes months comparable.
  const { perMonth, maxExpense, rangeExpense } = useMemo(() => {
    const perMonth = months.map((m) => dailyTotals(txs, m))
    let max = 0
    let sum = 0
    for (const days of perMonth)
      for (const d of days) {
        if (d.expense > max) max = d.expense
        sum += d.expense
      }
    return { perMonth, maxExpense: max, rangeExpense: sum }
  }, [txs, months])

  const inViewToday = (ms: Date[]) =>
    ms.some((m) => m.getFullYear() === new Date().getFullYear() && m.getMonth() === new Date().getMonth())

  const canNext = rangeEndBeforeCurrentMonth(months)

  const step = (dir: -1 | 1) => {
    const next =
      zoom === 'year'
        ? new Date(anchor.getFullYear() + dir, 0, 1)
        : zoom === 'quarter'
          ? startOfMonth(addMonths(months[0], dir * 3))
          : startOfMonth(addMonths(anchor, dir))
    setAnchor(next)
    const nextMonths =
      zoom === 'month'
        ? [next]
        : zoom === 'quarter'
          ? [0, 1, 2].map((i) => addMonths(next, i))
          : Array.from({ length: 12 }, (_, i) => new Date(next.getFullYear(), i, 1))
    setSelected(inViewToday(nextMonths) ? today : null)
  }

  const changeZoom = (z: Zoom) => {
    setZoom(z)
    const ms =
      z === 'month'
        ? [anchor]
        : z === 'quarter'
          ? (() => {
              const q = Math.floor(anchor.getMonth() / 3) * 3
              const start = new Date(anchor.getFullYear(), q, 1)
              return [0, 1, 2].map((i) => addMonths(start, i))
            })()
          : Array.from({ length: 12 }, (_, i) => new Date(anchor.getFullYear(), i, 1))
    setSelected(inViewToday(ms) ? today : null)
  }

  const label =
    zoom === 'month'
      ? monthLabel(anchor)
      : zoom === 'quarter'
        ? `${monthShort(months[0].getMonth())} – ${monthShort(months[2].getMonth())} ${months[0].getFullYear()}`
        : String(anchor.getFullYear())

  const selectedTxs = useMemo(
    () => (selected ? txs.filter((t) => t.date === selected) : []),
    [txs, selected],
  )
  const selectedExpense = selectedTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.baseAmount, 0)

  return (
    <div>
      <div className="mb-3 flex justify-center">
        <Segmented
          options={[
            { value: 'month', label: 'Month' },
            { value: 'quarter', label: 'Quarter' },
            { value: 'year', label: 'Year' },
          ]}
          value={zoom}
          onChange={changeZoom}
        />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => step(-1)}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2"
          aria-label="Previous"
        >
          <ChevronLeftIcon size={20} />
        </button>
        <div className="text-center">
          <p className="text-base font-semibold">{label}</p>
          <p className="text-xs text-muted">{formatMoney(rangeExpense, base)} spent</p>
        </div>
        <button
          onClick={() => step(1)}
          disabled={!canNext}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2 disabled:opacity-30"
          aria-label="Next"
        >
          <ChevronRightIcon size={20} />
        </button>
      </div>

      <div className="rounded-[1.375rem] bg-surface p-3">
        {zoom === 'month' ? (
          <MonthGrid
            monthAnchor={months[0]}
            days={perMonth[0]}
            maxExpense={maxExpense}
            first={first}
            today={today}
            selected={selected}
            onSelect={setSelected}
            variant="full"
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {months.map((m, i) => (
              <MonthGrid
                key={toISO(m)}
                monthAnchor={m}
                days={perMonth[i]}
                maxExpense={maxExpense}
                first={first}
                today={today}
                selected={selected}
                onSelect={setSelected}
                variant="mini"
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between px-1">
            <p className="text-sm font-semibold">
              {selected === today ? 'Today' : formatShortDate(selected)}
            </p>
            <p className="text-sm font-bold tabular-nums text-expense">
              {selectedExpense > 0 ? '-' + formatMoney(selectedExpense, base) : '—'}
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function MonthGrid({
  monthAnchor,
  days,
  maxExpense,
  first,
  today,
  selected,
  onSelect,
  variant,
}: {
  monthAnchor: Date
  days: DayTotal[]
  maxExpense: number
  first: 0 | 1
  today: string
  selected: string | null
  onSelect: (iso: string) => void
  variant: 'full' | 'mini'
}) {
  const mini = variant === 'mini'
  const firstDow = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1).getDay()
  const leadingBlanks = (firstDow - first + 7) % 7
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + first) % 7])

  return (
    <div>
      {mini && (
        <p className="mb-1 text-center text-[0.625rem] font-semibold text-muted">
          {monthShort(monthAnchor.getMonth())}
        </p>
      )}
      {!mini && (
        <div className="mb-1 grid grid-cols-7 gap-1">
          {weekdayLabels.map((w, i) => (
            <div key={i} className="text-center text-[0.625rem] font-semibold uppercase text-muted">
              {w[0]}
            </div>
          ))}
        </div>
      )}
      <div className={cn('grid grid-cols-7', mini ? 'gap-0.5' : 'gap-1')}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((d) => {
          const frac = maxExpense > 0 ? d.expense / maxExpense : 0
          const alpha = d.expense > 0 ? 0.18 + 0.82 * frac : 0
          const isToday = d.iso === today
          const isSel = d.iso === selected
          const isFuture = d.iso > today
          return (
            <button
              key={d.iso}
              onClick={() => onSelect(d.iso)}
              aria-label={d.iso}
              className={cn(
                'relative grid aspect-square place-items-center tabular-nums transition-transform active:scale-90',
                mini ? 'rounded-[3px]' : 'rounded-lg text-xs',
                isFuture ? 'text-muted/40' : frac > 0.55 ? 'font-semibold text-white' : 'text-content',
                isSel && (mini ? 'ring-2 ring-primary' : 'ring-2 ring-primary'),
                isToday && !isSel && 'ring-1 ring-muted',
              )}
              style={{
                backgroundColor:
                  d.expense > 0
                    ? `rgb(var(--c-expense) / ${alpha})`
                    : 'rgb(var(--c-surface2) / 0.5)',
              }}
            >
              {!mini && d.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Whether the visible range ends before the current calendar month — i.e.
 * there's a later period to move forward into. */
function rangeEndBeforeCurrentMonth(months: Date[]): boolean {
  const last = months[months.length - 1]
  const now = new Date()
  return (
    last.getFullYear() < now.getFullYear() ||
    (last.getFullYear() === now.getFullYear() && last.getMonth() < now.getMonth())
  )
}
