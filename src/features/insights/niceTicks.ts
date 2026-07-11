/** Rounds a raw tick step up to the nearest "nice" 1 / 2 / 2.5 / 5 / 10 (×10ⁿ)
 * value — the standard rounding most charting libraries use — so gridlines
 * land on amounts a person would actually round to, instead of the data's
 * own raw min/max/midpoint. */
export function niceStep(rawStep: number): number {
  if (!(rawStep > 0)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return nice * mag
}
