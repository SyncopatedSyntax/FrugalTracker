/** Local calendar date as "YYYY-MM-DD" (never UTC-shifted). */
export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISO(new Date())
}

/** Parse "YYYY-MM-DD" to a local Date at midnight. */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function yearKey(iso: string): string {
  return iso.slice(0, 4)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function addYears(d: Date, n: number): Date {
  return new Date(d.getFullYear() + n, d.getMonth(), 1)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Start of the week containing d, honouring firstDayOfWeek (0=Sun, 1=Mon). */
export function startOfWeek(d: Date, firstDay: 0 | 1 = 1): Date {
  const day = d.getDay()
  const diff = (day - firstDay + 7) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(aISO: string, bISO: string): number {
  const a = parseISO(aISO).getTime()
  const b = parseISO(bISO).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function daysInMonth(d: Date): number {
  return endOfMonth(d).getDate()
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function monthShort(monthIndex: number): string {
  return MONTHS_SHORT[monthIndex]
}

/** Human day header for grouped lists: "Today", "Yesterday", or "Sat, 5 Jul 2026". */
export function formatDayHeader(iso: string): string {
  const d = parseISO(iso)
  const today = new Date()
  const t = toISO(today)
  const y = toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  if (iso === t) return 'Today'
  if (iso === y) return 'Yesterday'
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const showYear = d.getFullYear() !== today.getFullYear()
  return `${weekday}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`
}

/** Compact date like "5 Jul". */
export function formatShortDate(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}
