import { describe, expect, it } from 'vitest'
import { addDays, toISO, todayISO } from '@/lib/date'
import { barBuckets, resolvePeriod } from './period'

function daysAgo(n: number): string {
  return toISO(addDays(new Date(), -n))
}

describe('barBuckets', () => {
  it('coarsens the year view to one bucket per month', () => {
    const period = resolvePeriod('year', new Date(2026, 5, 15), { from: '', to: '' }, 1, '2020-01-01')
    const buckets = barBuckets(period)
    expect(buckets).toHaveLength(12)
    expect(buckets[0].startISO).toBe('2026-01-01')
    expect(buckets[0].endISO).toBe('2026-01-31')
    expect(buckets[11].startISO).toBe('2026-12-01')
    expect(buckets[11].endISO).toBe('2026-12-31')
  })

  it('reuses the period\'s own buckets for non-year granularities', () => {
    const period = resolvePeriod('month', new Date(2026, 5, 15), { from: '', to: '' }, 1, '2020-01-01')
    expect(barBuckets(period)).toBe(period.buckets)
  })

  it('reuses the period\'s own buckets for the week granularity', () => {
    const period = resolvePeriod('week', new Date(2026, 5, 15), { from: '', to: '' }, 1, '2020-01-01')
    expect(barBuckets(period)).toBe(period.buckets)
    expect(barBuckets(period)).toHaveLength(7)
  })

  it('coarsens an "All time" range in the medium (weekly) tier to monthly bars', () => {
    // ~1 year of history -> the line chart uses weekly checkpoints, but bars
    // should still coarsen to one per month, same as the Year granularity.
    const period = resolvePeriod('all', new Date(), { from: '', to: '' }, 1, daysAgo(400))
    expect(period.buckets.length).toBeGreaterThan(20) // weekly checkpoints, not ~13 monthly
    const bars = barBuckets(period)
    expect(bars).not.toBe(period.buckets)
    expect(bars.every((b) => b.key.length === 7)).toBe(true) // "YYYY-MM" monthly keys
  })

  it('leaves a short "Custom" range (daily buckets) unchanged for bars', () => {
    const period = resolvePeriod('custom', new Date(), { from: daysAgo(20), to: todayISO() }, 1, '2020-01-01')
    expect(barBuckets(period)).toBe(period.buckets)
  })

  it('leaves a multi-year "Custom" range (already-monthly buckets) unchanged for bars', () => {
    const period = resolvePeriod('custom', new Date(), { from: daysAgo(1500), to: todayISO() }, 1, '2020-01-01')
    expect(period.buckets.every((b) => b.key.length === 7)).toBe(true)
    expect(barBuckets(period)).toBe(period.buckets)
  })
})

describe('dynamic granularity for All time / Custom', () => {
  it('uses daily buckets for a short "All time" span', () => {
    const period = resolvePeriod('all', new Date(), { from: '', to: '' }, 1, daysAgo(30))
    // One bucket per calendar day.
    expect(period.buckets.length).toBeGreaterThanOrEqual(29)
    expect(period.buckets.every((b) => b.startISO === b.endISO)).toBe(true)
  })

  it('uses weekly checkpoints (not flat monthly points) for a ~1 year "All time" span', () => {
    const period = resolvePeriod('all', new Date(), { from: '', to: '' }, 1, daysAgo(365))
    // A flat month bucketing would give ~13 points; weekly checkpoints give far more.
    expect(period.buckets.length).toBeGreaterThan(40)
  })

  it('uses monthly buckets (not flat yearly points) for a multi-year "All time" span', () => {
    const period = resolvePeriod('all', new Date(), { from: '', to: '' }, 1, daysAgo(365 * 4))
    // A flat year bucketing would give only 4-5 points; monthly gives ~48+.
    expect(period.buckets.length).toBeGreaterThan(40)
    expect(period.buckets.every((b) => b.key.length === 7)).toBe(true)
  })

  it('applies the same dynamic tiering to a "Custom" range', () => {
    const shortPeriod = resolvePeriod('custom', new Date(), { from: daysAgo(10), to: todayISO() }, 1, '2020-01-01')
    expect(shortPeriod.buckets.every((b) => b.startISO === b.endISO)).toBe(true)

    const mediumPeriod = resolvePeriod('custom', new Date(), { from: daysAgo(300), to: todayISO() }, 1, '2020-01-01')
    expect(mediumPeriod.buckets.length).toBeGreaterThan(20)

    const longPeriod = resolvePeriod('custom', new Date(), { from: daysAgo(1200), to: todayISO() }, 1, '2020-01-01')
    expect(longPeriod.buckets.every((b) => b.key.length === 7)).toBe(true)
    expect(longPeriod.buckets.length).toBeGreaterThan(20)
  })
})
