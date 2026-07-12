import { cn } from '@/lib/cn'
import type { TxType } from '@/db/types'

/** Fixed pixel width, shared with the currency chip beside it (see
 * AddScreen.tsx) so the two stay a matched pair regardless of which label
 * ("Expense" vs "Income", or which currency code) is currently showing. */
export const TYPE_SWITCH_WIDTH = 108

interface Props {
  value: TxType
  onChange: (v: TxType) => void
}

/** A sliding switch for Expense/Income: the thumb carries the current word
 * and always stays the same total width, so typing never nudges it and
 * "Income" (shorter) doesn't shrink the control. The static +/- at each end
 * are always the OTHER side's glyph relative to wherever the thumb currently
 * sits — so whichever one is left exposed confirms the active state (minus
 * showing while on Expense, plus showing while on Income). */
export default function TypeSwitch({ value, onChange }: Props) {
  const isIncome = value === 'income'
  return (
    <button
      type="button"
      onClick={() => onChange(isIncome ? 'expense' : 'income')}
      aria-label={isIncome ? 'Income. Tap to switch to Expense.' : 'Expense. Tap to switch to Income.'}
      className="relative h-[34px] w-[108px] flex-shrink-0 rounded-full bg-surface2"
    >
      <span className="absolute left-[12px] top-1/2 -translate-y-1/2 text-xs font-bold text-muted">
        +
      </span>
      <span className="absolute right-[12px] top-1/2 -translate-y-1/2 text-xs font-bold text-muted">
        −
      </span>
      <span
        className={cn(
          'absolute left-[3px] top-[3px] grid h-[28px] w-[80px] place-items-center rounded-full text-[0.8125rem] font-bold text-white transition-transform duration-200',
          isIncome ? 'translate-x-[22px] bg-income' : 'translate-x-0 bg-expense',
        )}
      >
        {isIncome ? 'Income' : 'Expense'}
      </span>
    </button>
  )
}
