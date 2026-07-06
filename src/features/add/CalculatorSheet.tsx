import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { CheckIcon } from '@/components/icons'
import { evaluateExpression } from '@/lib/calc'
import { formatMoney } from '@/lib/currency'

interface Props {
  open: boolean
  onClose: () => void
  base: string
  decimals: number
  /** Called with the resolved value when the user taps "Use amount". */
  onUse: (value: number) => void
}

const OPS = '+-*/'
function toGlyphs(expr: string): string {
  return expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, ' − ').replace(/\+/g, ' + ')
}

/** A standalone calculator (with parentheses) that opens over the entry screen.
 * `=` collapses the expression to its result; "Use amount" carries it back. */
export default function CalculatorSheet({ open, onClose, base, decimals, onUse }: Props) {
  const [expr, setExpr] = useState('')

  useEffect(() => {
    if (open) setExpr('')
  }, [open])

  const result = useMemo(() => evaluateExpression(expr), [expr])

  if (!open) return null

  const push = (ch: string) => {
    setExpr((e) => {
      const last = e[e.length - 1]
      // Collapse consecutive operators (except a minus right after "(").
      if (OPS.includes(ch) && last && OPS.includes(last)) {
        if (ch === '-' && last === '(') return e + ch
        return e.slice(0, -1) + ch
      }
      return e + ch
    })
  }
  const backspace = () => setExpr((e) => e.slice(0, -1))
  const clearAll = () => setExpr('')
  const resolve = () => {
    if (result !== null) setExpr(String(result))
  }
  const use = () => {
    const v = result ?? 0
    onUse(Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals))
    onClose()
  }

  const Key = ({
    label,
    onClick,
    variant = 'num',
  }: {
    label: React.ReactNode
    onClick: () => void
    variant?: 'num' | 'fn' | 'op' | 'eq'
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center rounded-2xl border text-xl font-semibold tabular-nums transition-transform active:scale-95',
        variant === 'num' && 'border-border bg-surface2 text-content',
        variant === 'fn' && 'border-border bg-surface text-lg text-primary',
        variant === 'op' && 'border-border bg-surface text-2xl text-primary',
        variant === 'eq' && 'border-transparent bg-primary text-2xl text-primary-fg',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg animate-fade-in">
      <div className="safe-top" />
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="text-sm font-medium text-muted active:opacity-60">
          Cancel
        </button>
        <span className="text-base font-semibold">Calculator</span>
        <span className="w-12" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mt-2 rounded-[22px] bg-surface p-4 text-right">
          <div className="min-h-[20px] break-all font-mono text-sm text-muted">
            {toGlyphs(expr) || ' '}
          </div>
          <div className="mt-1 truncate text-4xl font-bold tabular-nums">
            {result === null ? '0' : result.toLocaleString('en-US', { maximumFractionDigits: 8 })}
          </div>
        </div>
      </div>

      <div className="safe-bottom px-3 pb-3">
        <div className="grid grid-cols-4 gap-2">
          <Key label="AC" variant="fn" onClick={clearAll} />
          <Key label="(" variant="fn" onClick={() => push('(')} />
          <Key label=")" variant="fn" onClick={() => push(')')} />
          <Key label="÷" variant="op" onClick={() => push('/')} />
          <Key label="7" onClick={() => push('7')} />
          <Key label="8" onClick={() => push('8')} />
          <Key label="9" onClick={() => push('9')} />
          <Key label="×" variant="op" onClick={() => push('*')} />
          <Key label="4" onClick={() => push('4')} />
          <Key label="5" onClick={() => push('5')} />
          <Key label="6" onClick={() => push('6')} />
          <Key label="−" variant="op" onClick={() => push('-')} />
          <Key label="1" onClick={() => push('1')} />
          <Key label="2" onClick={() => push('2')} />
          <Key label="3" onClick={() => push('3')} />
          <Key label="+" variant="op" onClick={() => push('+')} />
          <Key label="0" onClick={() => push('0')} />
          {decimals > 0 ? <Key label="." onClick={() => push('.')} /> : <span />}
          <Key label="⌫" variant="fn" onClick={backspace} />
          <Key label="=" variant="eq" onClick={resolve} />
        </div>
        <button
          type="button"
          onClick={use}
          disabled={result === null || result <= 0}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-income text-base font-bold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          <CheckIcon size={18} />
          Use {formatMoney(result ?? 0, base)}
        </button>
      </div>
    </div>
  )
}
