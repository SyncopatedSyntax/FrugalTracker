import { describe, expect, it } from 'vitest'
import {
  applyAmountKey,
  calcEquals,
  calcExpression,
  calcInput,
  calcOperator,
  calcPending,
  calcPercent,
  evaluateExpression,
  initialCalc,
  OP_CHAR,
} from './calc'

function type(cur: string, keys: string, decimals = 2): string {
  return keys.split('').reduce((acc, k) => applyAmountKey(acc, k, decimals), cur)
}

describe('applyAmountKey', () => {
  it('appends digits and replaces a leading zero', () => {
    expect(type('', '50')).toBe('50')
    expect(applyAmountKey('0', '5', 2)).toBe('5')
  })

  it('adds a decimal point once, and only when decimals > 0', () => {
    expect(applyAmountKey('', '.', 2)).toBe('0.')
    expect(applyAmountKey('1.5', '.', 2)).toBe('1.5') // already has one
    expect(applyAmountKey('', '.', 0)).toBe('') // no decimals allowed
  })

  it('caps the fractional part at the currency decimal count', () => {
    expect(applyAmountKey('1.23', '4', 2)).toBe('1.23')
    expect(applyAmountKey('1.2', '3', 2)).toBe('1.23')
  })

  it('caps the integer part at 12 digits', () => {
    expect(applyAmountKey('123456789012', '3', 2)).toBe('123456789012')
  })

  it('backspaces one character', () => {
    expect(applyAmountKey('123', 'back', 2)).toBe('12')
  })
})

describe('inline calculator state machine', () => {
  it('50 + 18% = 59 (iOS-style: percent relative to the accumulator for +/-)', () => {
    let s = initialCalc()
    s = calcInput(s, '5', 2)
    s = calcInput(s, '0', 2)
    s = calcOperator(s, '+', 2)
    s = calcInput(s, '1', 2)
    s = calcInput(s, '8', 2)
    s = calcPercent(s, 2)
    s = calcEquals(s, 2)
    expect(s.cur).toBe('59')
    expect(s.op).toBeNull()
  })

  it('50 x 18% = 9 (plain /100 for * and /)', () => {
    let s = initialCalc()
    s = calcInput(s, '5', 2)
    s = calcInput(s, '0', 2)
    s = calcOperator(s, '*', 2)
    s = calcInput(s, '1', 2)
    s = calcInput(s, '8', 2)
    s = calcPercent(s, 2)
    s = calcEquals(s, 2)
    expect(s.cur).toBe('9')
  })

  it('100 / 3 = 33.33 (rounded to the decimal cap)', () => {
    let s = initialCalc()
    s = calcInput(s, '1', 2)
    s = calcInput(s, '0', 2)
    s = calcInput(s, '0', 2)
    s = calcOperator(s, '/', 2)
    s = calcInput(s, '3', 2)
    s = calcEquals(s, 2)
    expect(s.cur).toBe('33.33')
  })

  it('chains operators: 10 + 5 + 3 = 18', () => {
    let s = initialCalc()
    s = calcInput(s, '1', 2)
    s = calcInput(s, '0', 2)
    s = calcOperator(s, '+', 2)
    s = calcInput(s, '5', 2)
    s = calcOperator(s, '+', 2) // resolves the pending 10+5 first
    expect(s.acc).toBe(15)
    s = calcInput(s, '3', 2)
    s = calcEquals(s, 2)
    expect(s.cur).toBe('18')
  })

  it('pressing an operator twice in a row swaps it instead of chaining', () => {
    let s = initialCalc()
    s = calcInput(s, '1', 2)
    s = calcInput(s, '0', 2)
    s = calcOperator(s, '+', 2)
    s = calcOperator(s, '-', 2)
    expect(s.op).toBe('-')
    expect(s.acc).toBe(10)
    expect(s.fresh).toBe(true)
  })

  it('calcPending reflects whether an operator is awaiting its right-hand side', () => {
    let s = initialCalc()
    expect(calcPending(s)).toBe(false)
    s = calcInput(s, '5', 2)
    s = calcOperator(s, '+', 2)
    expect(calcPending(s)).toBe(true)
  })

  it('a fresh "back" clears the just-started operand without touching acc/op', () => {
    let s = initialCalc()
    s = calcInput(s, '5', 2)
    s = calcOperator(s, '+', 2)
    s = calcInput(s, 'back', 2)
    expect(s).toEqual({ acc: 5, op: '+', cur: '', fresh: false })
  })

  it('calcExpression renders the pending accumulator and glyph, empty when nothing is pending', () => {
    const fmt = (n: number) => String(n)
    let s = initialCalc()
    expect(calcExpression(s, fmt)).toBe('')
    s = calcInput(s, '5', 2)
    s = calcOperator(s, '/', 2)
    expect(calcExpression(s, fmt)).toBe(`5 ${OP_CHAR['/']}`)
  })
})

describe('evaluateExpression (full-screen calculator)', () => {
  it('returns null for an empty or purely-operator expression', () => {
    expect(evaluateExpression('')).toBeNull()
    expect(evaluateExpression('+')).toBeNull()
  })

  it('evaluates basic arithmetic', () => {
    expect(evaluateExpression('1200/4')).toBe(300)
    expect(evaluateExpression('2+3*4')).toBe(14) // precedence: * before +
  })

  it('supports parentheses, including nesting', () => {
    expect(evaluateExpression('(45+30)/3')).toBe(25)
    expect(evaluateExpression('2*(3+4)-5')).toBe(9)
  })

  it('auto-closes an unmatched "("', () => {
    expect(evaluateExpression('(2+3')).toBe(5)
  })

  it('drops a dangling trailing operator so mid-typing input still previews', () => {
    expect(evaluateExpression('12+')).toBe(12)
  })

  it('ignores whitespace', () => {
    expect(evaluateExpression(' 2 + 3 ')).toBe(5)
  })

  it('parses a leading-dot decimal', () => {
    expect(evaluateExpression('.5+1')).toBe(1.5)
  })

  it('treats divide-by-zero as 0 rather than Infinity/NaN', () => {
    expect(evaluateExpression('5/0')).toBe(0)
  })

  it('rounds away float noise', () => {
    expect(evaluateExpression('0.1+0.2')).toBe(0.3)
  })
})
