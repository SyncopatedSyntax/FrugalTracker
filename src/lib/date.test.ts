import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  daysInMonth,
  formatDayHeader,
  formatShortDate,
  parseISO,
  shiftYears,
  startOfWeek,
  toISO,
} from './date'

describe('toISO / parseISO', () => {
  it('round-trips a local date without UTC drift', () => {
    const d = new Date(2026, 5, 29) // June 29, 2026
    expect(toISO(d)).toBe('2026-06-29')
    const back = parseISO('2026-06-29')
    expect(back.getFullYear()).toBe(2026)
    expect(back.getMonth()).toBe(5)
    expect(back.getDate()).toBe(29)
  })

  it('pads single-digit months and days', () => {
    expect(toISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('startOfWeek', () => {
  it('anchors to Monday when firstDay=1', () => {
    // Wed July 1 2026
    const wed = new Date(2026, 6, 1)
    const start = startOfWeek(wed, 1)
    expect(toISO(start)).toBe('2026-06-29') // Monday
  })

  it('anchors to Sunday when firstDay=0', () => {
    const wed = new Date(2026, 6, 1)
    const start = startOfWeek(wed, 0)
    expect(toISO(start)).toBe('2026-06-28') // Sunday
  })

  it('is a no-op when d is already the anchor day', () => {
    const monday = new Date(2026, 6, 6)
    expect(toISO(startOfWeek(monday, 1))).toBe('2026-07-06')
  })
})

describe('addDays / addMonths / addYears', () => {
  it('addDays crosses month boundaries', () => {
    expect(toISO(addDays(new Date(2026, 0, 30), 5))).toBe('2026-02-04')
  })

  it('addMonths resets to day 1 of the target month', () => {
    expect(toISO(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01')
  })

  it('addYears resets to day 1 (month-anchor semantics)', () => {
    expect(toISO(addYears(new Date(2026, 5, 29), -1))).toBe('2025-06-01')
  })
})

describe('shiftYears (day-preserving)', () => {
  it('preserves month and day, unlike addYears', () => {
    expect(toISO(shiftYears(new Date(2026, 5, 29), -1))).toBe('2025-06-29')
  })

  it('shifts forward correctly', () => {
    expect(toISO(shiftYears(new Date(2025, 6, 5), 1))).toBe('2026-07-05')
  })

  it('clamps Feb 29 to Feb 28 for a non-leap target year', () => {
    // 2024 is a leap year; 2025 is not.
    expect(toISO(shiftYears(new Date(2024, 1, 29), 1))).toBe('2025-02-28')
  })

  it('handles leap-to-leap shifts exactly', () => {
    expect(toISO(shiftYears(new Date(2024, 1, 29), 4))).toBe('2028-02-29')
  })
})

describe('daysBetween', () => {
  it('counts whole days between two ISO dates', () => {
    expect(daysBetween('2026-06-29', '2026-07-05')).toBe(6)
    expect(daysBetween('2026-07-05', '2026-06-29')).toBe(-6)
  })
})

describe('daysInMonth', () => {
  it('handles 30/31 day months and February', () => {
    expect(daysInMonth(new Date(2026, 0, 15))).toBe(31) // Jan
    expect(daysInMonth(new Date(2026, 3, 15))).toBe(30) // Apr
    expect(daysInMonth(new Date(2026, 1, 1))).toBe(28) // Feb, non-leap
    expect(daysInMonth(new Date(2024, 1, 1))).toBe(29) // Feb, leap
  })
})

describe('formatDayHeader / formatShortDate', () => {
  it('formats a short date as "D Mon"', () => {
    expect(formatShortDate('2026-07-05')).toBe('5 Jul')
  })

  it('formats a day header with weekday and year for a date in a past year', () => {
    // 2020-03-15 is a Sunday; a past year so the year suffix is included.
    expect(formatDayHeader('2020-03-15')).toBe('Sun, 15 Mar 2020')
  })
})
