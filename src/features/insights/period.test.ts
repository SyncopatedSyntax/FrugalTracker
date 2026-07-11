import { describe, expect, it } from 'vitest'
import { barBuckets, resolvePeriod } from './period'

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
})
