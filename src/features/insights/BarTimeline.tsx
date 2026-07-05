import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'

export interface TimelineBar {
  key: string
  label: string
  /** Full label used in the caption (e.g. "March 2026"). */
  fullLabel: string
  value: number
}

interface Props {
  bars: TimelineBar[]
  /** CSS color for the fill. */
  color: string
  formatValue: (n: number) => string
  height?: number
}

export default function BarTimeline({ bars, color, formatValue, height = 168 }: Props) {
  const max = useMemo(() => Math.max(0, ...bars.map((b) => b.value)), [bars])
  const peak = useMemo(() => {
    let idx = -1
    let best = 0
    bars.forEach((b, i) => {
      if (b.value > best) {
        best = b.value
        idx = i
      }
    })
    return idx
  }, [bars])

  const [selected, setSelected] = useState<number>(peak)
  useEffect(() => setSelected(peak), [peak])

  const step = bars.length > 16 ? Math.ceil(bars.length / 6) : 1
  const active = selected >= 0 && selected < bars.length ? bars[selected] : undefined

  return (
    <div>
      <div className="mb-2 flex h-5 items-center justify-center gap-2 text-xs">
        {active ? (
          <>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted">{active.fullLabel}</span>
            <span className="font-semibold tabular-nums text-content">
              {formatValue(active.value)}
            </span>
          </>
        ) : (
          <span className="text-muted">No spending in this period</span>
        )}
      </div>

      <div className="flex items-end gap-[2px]" style={{ height }}>
        {bars.map((b, i) => {
          const pct = max > 0 ? (b.value / max) * 100 : 0
          const isSel = i === selected
          return (
            <button
              key={b.key}
              onClick={() => setSelected(i)}
              className="flex h-full flex-1 flex-col justify-end"
              aria-label={`${b.fullLabel}: ${formatValue(b.value)}`}
            >
              <div
                className={cn(
                  'min-h-[3px] w-full rounded-t transition-opacity',
                  !isSel && selected >= 0 && b.value > 0 && 'opacity-70',
                )}
                style={{
                  height: `${pct}%`,
                  backgroundColor: b.value > 0 ? color : 'rgb(var(--c-surface2))',
                }}
              />
            </button>
          )
        })}
      </div>

      <div className="mt-1.5 flex gap-[2px]">
        {bars.map((b, i) => (
          <span
            key={b.key}
            className="flex-1 text-center text-[10px] text-muted"
          >
            {i % step === 0 ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
