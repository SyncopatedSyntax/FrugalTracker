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

type Mode = 'day' | 'month' | 'year'

function chooseMode(startISO: string, endISO: string): Mode {
  const span = daysBetween(startISO, endISO)
  if (span <= 62) return 'day'
  if (span <= 731) return 'month'
  return 'year'
}

function buildBuckets(mode: Mode, startISO: string, endISO: string): Bucket[] {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  const multiYear = start.getFullYear() !== end.getFullYear()
  const out: Bucket[] = []

  if (mode === 'day') {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const iso = toISO(d)
      out.push({ key: iso, label: formatShortDate(iso), fullLabel: longDate(iso), startISO: iso, endISO: iso })
    }
  } else if (mode === 'month') {
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
  } else {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      out.push({
        key: String(y),
        label: String(y),
        fullLabel: String(y),
        startISO: `${y}-01-01`,
        endISO: `${y}-12-31`,
      })
    }
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
      buckets: buildBuckets('month', start, end),
      prev: {
        startISO: `${y - 1}-01-01`,
        endISO: `${y - 1}-12-31`,
        label: String(y - 1),
        buckets: buildBuckets('month', `${y - 1}-01-01`, `${y - 1}-12-31`),
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
      buckets: buildBuckets(chooseMode(start, end), start, end),
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
    buckets: buildBuckets(mode, from, to),
    prev: {
      startISO: prevStart,
      endISO: prevEnd,
      label: 'Prev. period',
      buckets: buildBuckets(mode, prevStart, prevEnd),
    },
    canGoNext: false,
  }
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
