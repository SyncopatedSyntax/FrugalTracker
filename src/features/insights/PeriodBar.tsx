import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
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
          <input
            type="date"
            value={custom.from}
            max={custom.to || todayISO()}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from}
            max={todayISO()}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-2.5 py-2 text-sm outline-none focus:border-primary"
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
