/** Format the raw keypad string for display, grouping the integer part. */
export function formatTypedAmount(v: string): string {
  if (v === '') return '0'
  const [intp, frac] = v.split('.')
  const grouped = Number(intp || '0').toLocaleString('en-US')
  return frac !== undefined ? `${grouped}.${frac}` : grouped
}

export function parseAmount(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Convert a stored number back into a keypad string for editing. */
export function numberToTyped(n: number): string {
  if (!n || !Number.isFinite(n)) return ''
  return String(n)
}
