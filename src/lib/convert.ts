/**
 * Rates are stored as: value of 1 unit of a currency expressed in the base
 * currency. The base currency therefore always has rate 1.
 */
export type RateMap = Map<string, number>

/** Convert an amount in `currency` into the base currency. */
export function toBase(amount: number, currency: string, rates: RateMap): number {
  const r = rates.get(currency)
  // Unknown currency: fall back to 1:1 so nothing silently vanishes.
  return amount * (r ?? 1)
}

/** Convert between two arbitrary currencies via the base. */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: RateMap,
): number {
  if (from === to) return amount
  const base = toBase(amount, from, rates)
  const rTo = rates.get(to)
  return rTo && rTo !== 0 ? base / rTo : base
}

/** True when we lack a rate for a non-base currency (report may be approximate). */
export function isRateMissing(currency: string, base: string, rates: RateMap): boolean {
  return currency !== base && !rates.has(currency)
}
