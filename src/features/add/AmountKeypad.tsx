import type { ComponentType } from 'react'
import { cn } from '@/lib/cn'
import { BackspaceIcon, CheckIcon } from '@/components/icons'

export function applyKey(value: string, key: string, decimals: number): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === '.') {
    if (decimals === 0 || value.includes('.')) return value
    return value === '' ? '0.' : value + '.'
  }
  // digit key
  if (value.includes('.')) {
    const frac = value.split('.')[1] ?? ''
    if (frac.length >= decimals) return value
  } else if (value.replace('.', '').length >= 12) {
    return value
  }
  if (value === '0') return key
  return value + key
}

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

interface Props {
  value: string
  onChange: (v: string) => void
  decimals: number
  onSubmit: () => void
  submitLabel?: string
  submitDisabled?: boolean
  accent?: 'expense' | 'income' | 'primary'
  /** Defaults to a checkmark; pass a different icon for non-final steps (e.g. "Next"). */
  submitIcon?: ComponentType<{ size?: number }>
  /** Stretch the keypad to exactly fill its container's height (keys grow/shrink
   * to fit), instead of using a fixed key height. */
  fill?: boolean
}

export default function AmountKeypad({
  value,
  onChange,
  decimals,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled,
  accent = 'primary',
  submitIcon: SubmitIcon = CheckIcon,
  fill,
}: Props) {
  const accentBg =
    accent === 'expense' ? 'bg-expense' : accent === 'income' ? 'bg-income' : 'bg-primary'

  return (
    <div className={cn('flex select-none flex-col px-2 pb-1', fill && 'h-full pt-1')}>
      <div className={cn('grid grid-cols-3 gap-2', fill && 'min-h-0 flex-1 grid-rows-4')}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === '.' && decimals === 0 ? null : onChange(applyKey(value, k, decimals)))}
            className={cn(
              'flex items-center justify-center rounded-[22px] border border-border bg-surface text-2xl font-medium text-content shadow-sm transition-transform active:scale-95 active:bg-surface2',
              fill ? 'min-h-0' : 'h-16',
              k === '.' && decimals === 0 && 'pointer-events-none opacity-30',
            )}
            aria-label={k === 'back' ? 'Delete' : k}
          >
            {k === 'back' ? <BackspaceIcon size={26} /> : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className={cn(
          'mt-2 flex h-14 w-full flex-shrink-0 items-center justify-center gap-2 rounded-[22px] text-lg font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none',
          accentBg,
        )}
      >
        <SubmitIcon size={22} />
        {submitLabel}
      </button>
    </div>
  )
}
