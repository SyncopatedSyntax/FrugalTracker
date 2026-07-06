/**
 * Calculator engine for the Quick-Add amount step. Two independent pieces:
 *
 *  1. A small state machine for the *inline* pad — digits, ÷ × − +, %, =, ⌫,
 *     AC — where the running entry doubles as the amount you'll save. iOS-style
 *     percent (50 + 18% = 59, 50 × 18% = 9).
 *  2. A parenthesis-aware expression evaluator for the *full-screen* calculator
 *     (shunting-yard → RPN, no eval), tolerant of half-typed input.
 *
 * All pure — no React — so it's trivially testable and reused by both modes.
 */

export type CalcOp = '+' | '-' | '*' | '/'

export interface CalcState {
  /** The accumulated left-hand operand, or null when no operation is pending. */
  acc: number | null
  op: CalcOp | null
  /** The current entry as a raw string (what shows as the amount). '' = empty. */
  cur: string
  /** True right after an operator: the next digit starts a fresh number. */
  fresh: boolean
}

export const OP_CHAR: Record<CalcOp, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

export function initialCalc(cur = ''): CalcState {
  return { acc: null, op: null, cur, fresh: false }
}

export function calcPending(s: CalcState): boolean {
  return s.op !== null
}

function num(cur: string): number {
  const n = parseFloat(cur)
  return isNaN(n) ? 0 : n
}

/** Round to the currency's decimals, then drop trailing-zero noise. */
function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

function raw(op: CalcOp, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? 0 : a / b
  }
}

/** Digit / '.' / 'back' entry, respecting the currency's decimal limit. */
export function calcInput(s: CalcState, key: string, decimals: number): CalcState {
  if (s.fresh) {
    // Starting a new operand after an operator.
    if (key === 'back') return { ...s, cur: '', fresh: false }
    if (key === '.') return decimals === 0 ? s : { ...s, cur: '0.', fresh: false }
    return { ...s, cur: key === '0' ? '0' : key, fresh: false }
  }
  return { ...s, cur: applyAmountKey(s.cur, key, decimals) }
}

export function calcOperator(s: CalcState, op: CalcOp, decimals: number): CalcState {
  if (s.acc === null) {
    return { acc: num(s.cur), op, cur: s.cur, fresh: true }
  }
  if (!s.fresh) {
    // Chain: resolve the pending op first, then start the new one.
    const r = roundTo(raw(s.op!, s.acc, num(s.cur)), decimals)
    return { acc: r, op, cur: String(r), fresh: true }
  }
  // Operator pressed twice — just swap it.
  return { ...s, op }
}

/** iOS-style percent: relative to the accumulator for + / −, else plain /100. */
export function calcPercent(s: CalcState, decimals: number): CalcState {
  const b = num(s.cur)
  const r =
    s.op && s.acc !== null && (s.op === '+' || s.op === '-')
      ? roundTo((s.acc * b) / 100, decimals)
      : roundTo(b / 100, decimals)
  return { ...s, cur: String(r), fresh: false }
}

export function calcEquals(s: CalcState, decimals: number): CalcState {
  if (s.acc === null || !s.op) return s
  const r = roundTo(raw(s.op, s.acc, num(s.cur)), decimals)
  return { acc: null, op: null, cur: String(r), fresh: true }
}

/** The expression tape, e.g. "1,200 ÷". Empty when nothing is pending. */
export function calcExpression(s: CalcState, fmt: (n: number) => string): string {
  if (s.acc === null || !s.op) return ''
  return `${fmt(s.acc)} ${OP_CHAR[s.op]}`
}

/* --------------------- shared amount-string entry --------------------- */

/** Append a digit / decimal to an amount string, honoring the decimal cap.
 * (The inline calculator and the plain keypad share this.) */
export function applyAmountKey(value: string, key: string, decimals: number): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === '.') {
    if (decimals === 0 || value.includes('.')) return value
    return value === '' ? '0.' : value + '.'
  }
  if (value.includes('.')) {
    const frac = value.split('.')[1] ?? ''
    if (frac.length >= decimals) return value
  } else if (value.replace('.', '').length >= 12) {
    return value
  }
  if (value === '0') return key
  return value + key
}

/* ----------------------- full-screen evaluator ------------------------ */

type Tok = { t: 'num'; v: number } | { t: 'op'; v: CalcOp } | { t: 'lp' } | { t: 'rp' }

function tokenize(expr: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c === ' ') {
      i++
      continue
    }
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++
      out.push({ t: 'num', v: parseFloat(expr.slice(i, j)) })
      i = j
      continue
    }
    if (c === '.') {
      let j = i
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++
      out.push({ t: 'num', v: parseFloat('0' + expr.slice(i, j)) })
      i = j
      continue
    }
    if (c === '(') out.push({ t: 'lp' })
    else if (c === ')') out.push({ t: 'rp' })
    else if (c === '+' || c === '-' || c === '*' || c === '/') out.push({ t: 'op', v: c })
    // anything else is ignored
    i++
  }
  return out
}

const PREC: Record<CalcOp, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

/**
 * Evaluate an arithmetic string with + − × ÷ and parentheses. Returns null when
 * there's nothing computable yet. Tolerant of a trailing operator (ignored) and
 * of unclosed "(" (auto-closed), so a mid-typing expression still previews.
 */
export function evaluateExpression(expr: string): number | null {
  const toks = tokenize(expr)
  // Drop a dangling trailing operator so "12 +" still evaluates to 12.
  while (toks.length && toks[toks.length - 1].t === 'op') toks.pop()
  if (!toks.length) return null

  const output: Tok[] = []
  const ops: Tok[] = []
  for (const tk of toks) {
    if (tk.t === 'num') output.push(tk)
    else if (tk.t === 'op') {
      while (
        ops.length &&
        ops[ops.length - 1].t === 'op' &&
        PREC[(ops[ops.length - 1] as { v: CalcOp }).v] >= PREC[tk.v]
      )
        output.push(ops.pop()!)
      ops.push(tk)
    } else if (tk.t === 'lp') ops.push(tk)
    else if (tk.t === 'rp') {
      while (ops.length && ops[ops.length - 1].t !== 'lp') output.push(ops.pop()!)
      if (ops.length) ops.pop() // discard the '('
    }
  }
  while (ops.length) {
    const o = ops.pop()!
    if (o.t !== 'lp') output.push(o) // auto-close unmatched '('
  }

  const st: number[] = []
  for (const tk of output) {
    if (tk.t === 'num') st.push(tk.v)
    else if (tk.t === 'op') {
      const b = st.pop()
      const a = st.pop()
      if (a === undefined || b === undefined) return null
      st.push(raw(tk.v, a, b))
    }
  }
  if (st.length !== 1 || isNaN(st[0]) || !isFinite(st[0])) return null
  return Math.round(st[0] * 1e6) / 1e6
}
