import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { formatShortDate, todayISO } from '@/lib/date'
import type { CustomRange, Granularity } from './period'

const GRANS: { v: Granularity; l: string }[] = [
  { v: 'week', l: 'Week' },
  { v: 'month', l: 'Month' },
  { v: 'year', l: 'Year' },
  { v: 'all', l: 'All' },
  { v: 'custom', l: 'Custom' },
]

interface Props {
  granularity: Granularity
  onGranularity: (g: Granularity) => void
  label: string
  canGoNext: boolean
  onStep: (dir: -1 | 1) => void
  custom: CustomRange
  onCustom: (c: CustomRange) => void
}

export default function PeriodBar({
  granularity,
  onGranularity,
  label,
  canGoNext,
  onStep,
  custom,
  onCustom,
}: Props) {
  const showNav = granularity === 'week' || granularity === 'month' || granularity === 'year'

  return (
    <div className="pt-2">
      <div className="flex gap-1">
        {GRANS.map((g) => (
          <button
            key={g.v}
            onClick={() => onGranularity(g.v)}
            className={cn(
              'flex-1 rounded-full px-1 py-1.5 text-center text-[0.8125rem] font-semibold transition-colors',
              granularity === g.v ? 'bg-primary text-primary-fg' : 'bg-surface2 text-muted',
            )}
          >
            {g.l}
          </button>
        ))}
      </div>

      {granularity === 'custom' ? (
        <div className="mt-2 flex items-center gap-2">
          <DatePill
            value={custom.from}
            max={custom.to || todayISO()}
            ariaLabel="From date"
            onChange={(v) => onCustom({ ...custom, from: v })}
          />
          <span className="flex-shrink-0 text-muted">–</span>
          <DatePill
            value={custom.to}
            min={custom.from}
            max={todayISO()}
            ariaLabel="To date"
            onChange={(v) => onCustom({ ...custom, to: v })}
          />
        </div>
      ) : showNav ? (
        <div className="mt-1 flex items-center justify-between">
          <button
            onClick={() => onStep(-1)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2"
            aria-label="Previous period"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-base font-semibold">{label}</span>
          <button
            disabled={!canGoNext}
            onClick={() => onStep(1)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface2 disabled:opacity-30"
            aria-label="Next period"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>
      ) : (
        <div className="mt-2 text-center text-base font-semibold">{label}</div>
      )}
    </div>
  )
}

/** A custom-range date field using the app's invisible-overlay pill pattern
 * (see docs/DEV_REVIEW.md §2 B9): the visible box is our own markup so it
 * can't be rendered wider than its bounds by a native control, with the real
 * <input type="date"> stacked invisibly on top to capture the tap and drive
 * the OS picker. */
function DatePill({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: string
  min?: string
  max?: string
  ariaLabel: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <div className="pointer-events-none flex items-center justify-between gap-1 rounded-xl border border-border bg-surface2 px-2.5 py-2 text-sm">
        <span className="truncate">{value ? formatShortDate(value) : 'Pick date'}</span>
        <CalendarIcon size={16} className="flex-shrink-0 text-muted" />
      </div>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
