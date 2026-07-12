import type { ComponentType } from 'react'
import { cn } from '@/lib/cn'
import { BackspaceIcon, CheckIcon } from '@/components/icons'
import { applyAmountKey, type CalcOp } from '@/lib/calc'
import type { KeypadReach } from '@/db/types'

/** Kept for backwards-compatible imports; the shared logic now lives in lib/calc. */
export const applyKey = applyAmountKey

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']
const OPERATORS: CalcOp[] = ['/', '*', '-', '+']
const OP_GLYPH: Record<CalcOp, string> = { '/': '÷', '*': '×', '-': '−', '+': '+' }

interface CalcProps {
  pending: boolean
  activeOp: CalcOp | null
  onDigit: (key: string) => void
  onOperator: (op: CalcOp) => void
  onPercent: () => void
  onEquals: () => void
  onAllClear: () => void
}

interface Props {
  value: string
  onChange: (v: string) => void
  decimals: number
  onSubmit: () => void
  submitLabel?: string
  submitDisabled?: boolean
  accent?: 'expense' | 'income' | 'primary'
  submitIcon?: ComponentType<{ size?: number }>
  fill?: boolean
  /** When set, digit/⌫ presses route through the calculator state machine
   * instead of `onChange`. Provided in both inline and full modes. */
  calc?: CalcProps
  /** Show the ÷×−+ rail and (when pending) the AC/%/= bar. Inline mode only. */
  showOperators?: boolean
  /** Full-calculator mode: show a chip that opens the standalone calculator. */
  onOpenCalculator?: () => void
  /** One-handed alignment; when left/right the cluster hugs that edge and the
   * empty gutter becomes a tap target to flip sides. */
  reach?: KeypadReach
  onReachFlip?: () => void
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
  calc,
  showOperators,
  onOpenCalculator,
  reach = 'center',
  onReachFlip,
}: Props) {
  const accentBg =
    accent === 'expense' ? 'bg-expense' : accent === 'income' ? 'bg-income' : 'bg-primary'

  const pressDigit = (k: string) => {
    if (k === '.' && decimals === 0) return
    if (calc) calc.onDigit(k)
    else onChange(applyAmountKey(value, k, decimals))
  }

  const clusterWidth =
    reach === 'left' ? 'w-[82%] mr-auto' : reach === 'right' ? 'w-[82%] ml-auto' : 'w-full'

  return (
    <div className={cn('relative flex select-none flex-col px-2 pb-1', fill && 'h-full pt-1')}>
      {reach !== 'center' && <ReachGutter side={reach} onFlip={onReachFlip} />}

      <div className={cn('flex min-h-0 flex-col', fill && 'h-full', clusterWidth)}>
        {/* Top rail: operators (inline calc) or a chip that opens the full calc. */}
        {showOperators && calc ? (
          <div className="mb-2 grid flex-shrink-0 grid-cols-4 gap-2">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => calc.onOperator(op)}
                className={cn(
                  'flex h-9 items-center justify-center rounded-xl border border-border bg-surface text-lg font-semibold transition-transform active:scale-95',
                  calc.activeOp === op ? 'bg-primary text-primary-fg' : 'text-primary',
                )}
                aria-label={`Operator ${OP_GLYPH[op]}`}
              >
                {OP_GLYPH[op]}
              </button>
            ))}
          </div>
        ) : onOpenCalculator ? (
          <div className="mb-2 flex flex-shrink-0 justify-end">
            <button
              type="button"
              onClick={onOpenCalculator}
              className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-muted active:scale-95"
            >
              <span className="font-mono text-primary">+−×÷</span> Calc
            </button>
          </div>
        ) : null}

        <div className={cn('grid grid-cols-3 gap-2', fill && 'min-h-0 flex-1 grid-rows-4')}>
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pressDigit(k)}
              className={cn(
                'flex items-center justify-center rounded-[1.375rem] border border-border bg-surface text-2xl font-medium text-content shadow-sm transition-transform active:scale-95 active:bg-surface2',
                fill ? 'min-h-0' : 'h-16',
                k === '.' && decimals === 0 && 'pointer-events-none opacity-30',
              )}
              aria-label={k === 'back' ? 'Delete' : k}
            >
              {k === 'back' ? <BackspaceIcon size={26} /> : k}
            </button>
          ))}
        </div>

        {/* Bottom bar: AC / % / = while calculating, otherwise the submit action. */}
        {calc && calc.pending ? (
          <div className="mt-2 grid flex-shrink-0 grid-cols-[1fr_1fr_1.3fr] gap-2">
            <button
              type="button"
              onClick={calc.onAllClear}
              className="flex h-14 items-center justify-center rounded-[1.375rem] border border-border bg-surface text-lg font-bold text-expense transition-transform active:scale-95"
            >
              AC
            </button>
            <button
              type="button"
              onClick={calc.onPercent}
              className="flex h-14 items-center justify-center rounded-[1.375rem] border border-border bg-surface text-lg font-bold text-content transition-transform active:scale-95"
            >
              %
            </button>
            <button
              type="button"
              onClick={calc.onEquals}
              className="flex h-14 items-center justify-center rounded-[1.375rem] bg-primary text-2xl font-bold text-primary-fg shadow-lg transition-transform active:scale-[0.98]"
            >
              =
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className={cn(
              'mt-2 flex h-14 w-full flex-shrink-0 items-center justify-center gap-2 rounded-[1.375rem] text-lg font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none',
              accentBg,
            )}
          >
            <SubmitIcon size={22} />
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  )
}

/** The empty-side gutter in reach mode: a quiet grabber-dot handle (variant B)
 * that flips the pad to the other side on tap. The whole strip is tappable. */
function ReachGutter({ side, onFlip }: { side: 'left' | 'right'; onFlip?: () => void }) {
  return (
    <button
      type="button"
      aria-label="Move keypad to the other side"
      onClick={() => onFlip?.()}
      className={cn(
        'absolute bottom-0 top-0 z-[1] flex w-[18%] items-center justify-center active:bg-primary/10',
        // Pad hugs `side`, so the gutter sits opposite it.
        side === 'left' ? 'right-0' : 'left-0',
      )}
    >
      <span className="flex flex-col gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-muted" />
        ))}
      </span>
    </button>
  )
}
