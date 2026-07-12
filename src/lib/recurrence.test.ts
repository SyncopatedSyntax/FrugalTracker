import { describe, expect, it } from 'vitest'
import { FREQUENCIES, FREQUENCY_LABELS, nextOccurrence } from './recurrence'

describe('nextOccurrence', () => {
  it('steps daily/weekly/biweekly by the right number of days', () => {
    expect(nextOccurrence('2026-07-12', 'daily')).toBe('2026-07-13')
    expect(nextOccurrence('2026-07-12', 'weekly')).toBe('2026-07-19')
    expect(nextOccurrence('2026-07-12', 'biweekly')).toBe('2026-07-26')
  })

  it('steps monthly, preserving day-of-month', () => {
    expect(nextOccurrence('2026-01-15', 'monthly')).toBe('2026-02-15')
    expect(nextOccurrence('2026-06-01', 'monthly')).toBe('2026-07-01')
  })

  it('clamps monthly to the last day of a shorter target month', () => {
    // 2026 is not a leap year: Jan 31 -> Feb 28.
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28')
    // 2028 is a leap year: Jan 31 -> Feb 29.
    expect(nextOccurrence('2028-01-31', 'monthly')).toBe('2028-02-29')
  })

  it('steps yearly, preserving month/day', () => {
    expect(nextOccurrence('2026-07-12', 'yearly')).toBe('2027-07-12')
  })

  it('clamps yearly Feb 29 to Feb 28 in a non-leap target year', () => {
    expect(nextOccurrence('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  it('has a label for every supported frequency', () => {
    for (const f of FREQUENCIES) {
      expect(FREQUENCY_LABELS[f]).toBeTruthy()
    }
  })
})
