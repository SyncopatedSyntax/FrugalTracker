import { useCallback, useMemo, useState } from 'react'
import {
  calcEquals,
  calcExpression,
  calcInput,
  calcOperator,
  calcPending,
  calcPercent,
  initialCalc,
  type CalcOp,
  type CalcState,
} from '@/lib/calc'

/** Comma-group a number for the expression tape (e.g. 1200 → "1,200"). */
function groupNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

/**
 * Drives the inline calculator on the Quick-Add amount step. `cur` is the live
 * entry (shown as the amount and saved); operators/%/= mutate it in place.
 */
export function useCalculator(decimals: number) {
  const [state, setState] = useState<CalcState>(() => initialCalc(''))

  const input = useCallback((key: string) => setState((s) => calcInput(s, key, decimals)), [decimals])
  const operator = useCallback((op: CalcOp) => setState((s) => calcOperator(s, op, decimals)), [decimals])
  const percent = useCallback(() => setState((s) => calcPercent(s, decimals)), [decimals])
  const equals = useCallback(() => setState((s) => calcEquals(s, decimals)), [decimals])
  const allClear = useCallback(() => setState(initialCalc('')), [])
  const reset = useCallback(() => setState(initialCalc('')), [])
  /** Adopt an externally computed value (e.g. from the full-screen calculator). */
  const setValue = useCallback((v: number) => {
    const cur = Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : ''
    setState(initialCalc(cur))
  }, [])

  const pending = calcPending(state)
  const expression = calcExpression(state, groupNumber)
  const value = useMemo(() => {
    const n = parseFloat(state.cur)
    return isNaN(n) ? 0 : n
  }, [state.cur])
  const activeOp = state.fresh ? state.op : null

  return {
    cur: state.cur,
    value,
    pending,
    activeOp,
    expression,
    input,
    operator,
    percent,
    equals,
    allClear,
    reset,
    setValue,
  }
}
