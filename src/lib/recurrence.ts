import type { RecurrenceFrequency } from '@/db/types'
import { addDays, parseISO, shiftMonths, shiftYears, toISO } from './date'

export const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly']

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** The next occurrence after `dateISO`, per `frequency` — anchored to
 * `dateISO`'s own day-of-week (daily/weekly/biweekly) or day-of-month
 * (monthly/yearly, clamped to the last day of a shorter target month). */
export function nextOccurrence(dateISO: string, frequency: RecurrenceFrequency): string {
  const d = parseISO(dateISO)
  switch (frequency) {
    case 'daily':
      return toISO(addDays(d, 1))
    case 'weekly':
      return toISO(addDays(d, 7))
    case 'biweekly':
      return toISO(addDays(d, 14))
    case 'monthly':
      return toISO(shiftMonths(d, 1))
    case 'yearly':
      return toISO(shiftYears(d, 1))
  }
}
