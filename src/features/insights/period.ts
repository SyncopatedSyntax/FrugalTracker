import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  endOfMonth,
  formatShortDate,
  monthLabel,
  monthShort,
  parseISO,
  startOfMonth,
  startOfWeek,
  toISO,
  todayISO,
} from '@/lib/date'

export type Granularity = 'week' | 'month' | 'year' | 'all' | 'custom'

export interface Bucket {
  key: string
  /** Short axis label. */
  label: string
  /** Descriptive caption label. */
  fullLabel: string
  startISO: string
  /** Inclusive end date, used for cumulative valuation. */
  endISO: string
}

export interface PeriodInfo {
  granularity: Granularity
  startISO: string
  endISO: string
  label: string
  buckets: Bucket[]
  prev: { startISO: string; endISO: string; label: string; buckets: Bucket[] } | null
  canGoNext: boolean
}

export interface CustomRange {
  from: string
  to: string
}

type Mode = 'day' | 'week' | 'month'

/** Picks a bucket resolution that scales with how long the range actually
 * is, so "All time"/"Custom" stay readable whether they cover 3 weeks or 10
 * years: daily for short spans, weekly checkpoints for medium ones (the same
 * resolution the Year view already uses), monthly for anything longer —
 * never coarser than that, so even a many-year range still plots real
 * movement instead of collapsing to a handful of flat yearly points. */
function chooseMode(startISO: string, endISO: string): Mode {
  const span = daysBetween(startISO, endISO)
  if (span <= 62) return 'day'
  if (span <= 731) return 'week'
  return 'month'
}

function buildBucketsForMode(mode: Mode, startISO: string, endISO: string): Bucket[] {
  if (mode === 'week') return buildWeeklyBuckets(startISO, endISO)
  return buildBuckets(mode, startISO, endISO)
}

function buildBuckets(mode: 'day' | 'month', startISO: string, endISO: string): Bucket[] {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  const multiYear = start.getFullYear() !== end.getFullYear()
  const out: Bucket[] = []

  if (mode === 'day') {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const iso = toISO(d)
      out.push({ key: iso, label: formatShortDate(iso), fullLabel: longDate(iso), startISO: iso, endISO: iso })
    }
  } else {
    let d = startOfMonth(start)
    while (d <= end) {
      const s = toISO(d)
      const e = toISO(endOfMonth(d))
      out.push({
        key: s.slice(0, 7),
        label: multiYear ? `${monthShort(d.getMonth())} ${String(d.getFullYear()).slice(2)}` : monthShort(d.getMonth()),
        fullLabel: monthLabel(d),
        startISO: s,
        endISO: e > endISO ? endISO : e,
      })
      d = addMonths(d, 1)
    }
  }
  return out
}

/** Weekly checkpoints across the range, plus every month-end date, so a
 * roughly-year-long span (the Year view, or an "All time"/"Custom" range of
 * similar length) reads at a finer resolution than flat monthly points while
 * still giving a clean, recognizable marker at each month boundary. */
function buildWeeklyBuckets(startISO: string, endISO: string): Bucket[] {
  const start = parseISO(startISO)
  const end = parseISO(endISO)

  const dates = new Set<string>()
  for (let d = start; d <= end; d = addDays(d, 7)) {
    dates.add(toISO(d))
  }
  dates.add(endISO)
  for (let d = startOfMonth(start); d <= end; d = addMonths(d, 1)) {
    const monthEnd = endOfMonth(d)
    if (monthEnd >= start && monthEnd <= end) dates.add(toISO(monthEnd))
  }

  const sorted = [...dates].sort()
  const out: Bucket[] = []
  let prevISO = toISO(addDays(start, -1))
  for (const iso of sorted) {
    out.push({
      key: iso,
      label: formatShortDate(iso),
      fullLabel: longDate(iso),
      startISO: toISO(addDays(parseISO(prevISO), 1)),
      endISO: iso,
    })
    prevISO = iso
  }
  return out
}

function longDate(iso: string): string {
  const d = parseISO(iso)
  const cur = new Date().getFullYear()
  return `${formatShortDate(iso)}${d.getFullYear() !== cur ? ' ' + d.getFullYear() : ''}`
}

function rangeLabel(startISO: string, endISO: string): string {
  return `${formatShortDate(startISO)} – ${longDate(endISO)}`
}

export function resolvePeriod(
  granularity: Granularity,
  anchor: Date,
  custom: CustomRange,
  firstDay: 0 | 1,
  allStartISO: string,
): PeriodInfo {
  const today = todayISO()

  if (granularity === 'week') {
    const start = startOfWeek(anchor, firstDay)
    const end = addDays(start, 6)
    const prevStart = addDays(start, -7)
    const prevEnd = addDays(start, -1)
    return {
      granularity,
      startISO: toISO(start),
      endISO: toISO(end),
      label: rangeLabel(toISO(start), toISO(end)),
      buckets: buildBuckets('day', toISO(start), toISO(end)),
      prev: {
        startISO: toISO(prevStart),
        endISO: toISO(prevEnd),
        label: 'Prev. week',
        buckets: buildBuckets('day', toISO(prevStart), toISO(prevEnd)),
      },
      canGoNext: toISO(addDays(start, 7)) <= today,
    }
  }

  if (granularity === 'month') {
    const start = startOfMonth(anchor)
    const end = endOfMonth(anchor)
    const prevAnchor = addMonths(anchor, -1)
    const prevStart = startOfMonth(prevAnchor)
    const prevEnd = endOfMonth(prevAnchor)
    return {
      granularity,
      startISO: toISO(start),
      endISO: toISO(end),
      label: monthLabel(anchor),
      buckets: buildBuckets('day', toISO(start), toISO(end)),
      prev: {
        startISO: toISO(prevStart),
        endISO: toISO(prevEnd),
        label: monthLabel(prevAnchor),
        buckets: buildBuckets('day', toISO(prevStart), toISO(prevEnd)),
      },
      canGoNext: toISO(addMonths(anchor, 1)) <= today,
    }
  }

  if (granularity === 'year') {
    const y = anchor.getFullYear()
    const start = `${y}-01-01`
    const end = `${y}-12-31`
    return {
      granularity,
      startISO: start,
      endISO: end,
      label: String(y),
      buckets: buildWeeklyBuckets(start, end),
      prev: {
        startISO: `${y - 1}-01-01`,
        endISO: `${y - 1}-12-31`,
        label: String(y - 1),
        buckets: buildWeeklyBuckets(`${y - 1}-01-01`, `${y - 1}-12-31`),
      },
      canGoNext: y < new Date().getFullYear(),
    }
  }

  if (granularity === 'all') {
    const start = allStartISO || `${new Date().getFullYear()}-01-01`
    const end = today
    return {
      granularity,
      startISO: start,
      endISO: end,
      label: 'All time',
      buckets: buildBucketsForMode(chooseMode(start, end), start, end),
      prev: null,
      canGoNext: false,
    }
  }

  // custom
  const from = custom.from || today
  const to = custom.to || today
  const span = Math.max(0, daysBetween(from, to))
  const mode = chooseMode(from, to)
  const prevEnd = toISO(addDays(parseISO(from), -1))
  const prevStart = toISO(addDays(parseISO(from), -1 - span))
  return {
    granularity,
    startISO: from,
    endISO: to,
    label: rangeLabel(from, to),
    buckets: buildBucketsForMode(mode, from, to),
    prev: {
      startISO: prevStart,
      endISO: prevEnd,
      label: 'Prev. period',
      buckets: buildBucketsForMode(mode, prevStart, prevEnd),
    },
    canGoNext: false,
  }
}

/** Bucket resolution for the cash-flow bar chart specifically — coarser than
 * the line chart's own buckets wherever those are weekly checkpoints (too
 * fine-grained to read as distinct bars): the year view's ~52 weekly
 * checkpoints become one bar per month instead, and the same coarsening
 * applies to an "All time"/"Custom" range that lands in the same
 * medium-length tier. Day-granularity and month-granularity buckets are
 * already bar-sized, so those pass through unchanged. */
export function barBuckets(period: PeriodInfo): Bucket[] {
  if (period.granularity === 'year') return buildBuckets('month', period.startISO, period.endISO)
  if (
    (period.granularity === 'all' || period.granularity === 'custom') &&
    chooseMode(period.startISO, period.endISO) === 'week'
  ) {
    return buildBuckets('month', period.startISO, period.endISO)
  }
  return period.buckets
}

export function stepAnchor(granularity: Granularity, anchor: Date, dir: -1 | 1): Date {
  switch (granularity) {
    case 'week':
      return addDays(anchor, dir * 7)
    case 'month':
      return addMonths(anchor, dir)
    case 'year':
      return addYears(anchor, dir)
    default:
      return anchor
  }
}
