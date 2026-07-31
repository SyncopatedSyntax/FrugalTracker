import type { Ref } from 'react'
import { ChevronRightIcon, TagIcon } from '@/components/icons'
import type { TxType } from '@/db/types'
import { formatMoney } from '@/lib/currency'
import { cn } from '@/lib/cn'
import { UNTAGGED_KEY, type Slice } from './compute'

/** One row of a breakdown list — icon chip, name, amount, share bar and
 * count/percentage. Shared by the Insights breakdown itself and the Labels
 * view's category picker, so the picker looks exactly like the Categories
 * screen it stands in for rather than drifting from it. */
export default function SliceRow({
  slice,
  kind,
  flow,
  base,
  chipAlpha,
  maxVal,
  total,
  active,
  expanded,
  onClick,
  rowRef,
}: {
  slice: Slice
  kind: 'category' | 'label'
  flow: TxType
  base: string
  chipAlpha: string
  /** Largest `value` in the list, so bars are comparable across rows. */
  maxVal: number
  total: number
  active: boolean
  /** Draws the chevron rotated; only the breakdown's category rows expand. */
  expanded?: boolean
  onClick: () => void
  rowRef?: Ref<HTMLButtonElement>
}) {
  const sign = flow === 'expense' ? '-' : ''
  const untagged = slice.key === UNTAGGED_KEY
  // From `share` so the row agrees with its own arc; the amount beside it stays
  // the full total, which is what the transactions list will show.
  const pct = total > 0 ? (slice.share / total) * 100 : 0

  return (
    <button
      ref={rowRef}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left',
        active ? 'bg-surface2' : 'hover:bg-surface2/60',
      )}
    >
      <span
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-base"
        style={{ backgroundColor: slice.color + chipAlpha }}
      >
        {kind === 'category' ? (
          slice.icon
        ) : (
          <TagIcon size={16} style={{ color: slice.color }} className={cn(untagged && 'opacity-60')} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {kind === 'label' && !untagged ? '#' + slice.name : slice.name}
          </span>
          <span
            className={cn(
              'flex-shrink-0 text-sm font-semibold tabular-nums',
              flow === 'expense' ? 'text-expense' : 'text-income',
            )}
          >
            {sign}
            {formatMoney(slice.value, base)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${maxVal > 0 ? (slice.value / maxVal) * 100 : 0}%`,
                backgroundColor: slice.color,
              }}
            />
          </span>
          {/* Wide enough (and non-wrapping) for a 3-digit count —
              "901 tx · 80%" — which the Untagged row reliably has. */}
          <span className="w-20 flex-shrink-0 whitespace-nowrap text-right text-[0.6875rem] text-muted">
            {slice.count} tx · {pct.toFixed(0)}%
          </span>
        </span>
      </span>
      <ChevronRightIcon
        size={16}
        className={cn('flex-shrink-0 text-muted/50 transition-transform', expanded && 'rotate-90')}
      />
    </button>
  )
}
