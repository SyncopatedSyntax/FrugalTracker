import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { niceStep } from './niceTicks'
import { useChartWidth } from './useChartWidth'

export interface LineSeries {
  name: string
  points: Array<number | null>
  color: string
  /** Fill the area under the line (only the primary series should). */
  fill?: boolean
  dashed?: boolean
  /** Draw a marker at the last non-null point. */
  dot?: boolean
}

interface Props {
  series: LineSeries[]
  labels: string[]
  formatY: (n: number) => string
  height?: number
}

export default function LineChart({ series, labels, formatY, height = 190 }: Props) {
  const [ref, width] = useChartWidth()
  const gid = useId().replace(/[:]/g, '')

  const n = labels.length
  // padL reserves a gutter for the y-axis labels, sized generously enough for
  // compact currency labels (e.g. "$12.3K"), so they never sit on the curve.
  const padL = 40
  const padR = 8
  const padT = 16
  const padB = 20
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)

  const all = series.flatMap((s) => s.points.filter((p): p is number => p != null))
  let rawMin = all.length ? Math.min(...all) : 0
  let rawMax = all.length ? Math.max(...all) : 1
  if (rawMin === rawMax) {
    rawMin -= 1
    rawMax += 1
  }
  const step = niceStep((rawMax - rawMin) / 4)
  const min = Math.floor(rawMin / step) * step
  const max = Math.ceil(rawMax / step) * step

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * innerH

  // Default the inspector to the last actual point of the primary series.
  const primary = series[0]
  const lastActual = primary
    ? primary.points.reduce<number>((acc, p, i) => (p != null ? i : acc), -1)
    : -1
  const [sel, setSel] = useState<number>(lastActual)
  useEffect(() => setSel(lastActual), [lastActual, n])

  const pickFromClientX = (clientX: number) => {
    if (!ref.current || n <= 1) return
    const rect = ref.current.getBoundingClientRect()
    const rel = clientX - rect.left - padL
    const idx = Math.round((rel / innerW) * (n - 1))
    setSel(Math.max(0, Math.min(n - 1, idx)))
  }

  // Catmull-Rom → cubic Bezier: a smooth curve that still passes through
  // every data point (as opposed to an approximating spline), so the visible
  // shape stays truthful to the underlying values while reading as a curve
  // rather than a jagged polyline.
  const smoothPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += `C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} `
    }
    return d.trim()
  }

  const buildPath = (pts: Array<number | null>) => {
    const segments: Array<Array<{ x: number; y: number }>> = []
    let current: Array<{ x: number; y: number }> = []
    pts.forEach((p, i) => {
      if (p == null) {
        if (current.length) segments.push(current)
        current = []
        return
      }
      current.push({ x: x(i), y: y(p) })
    })
    if (current.length) segments.push(current)
    return segments.map(smoothPath).join(' ')
  }

  const areaPath = (pts: Array<number | null>) => {
    const idxs = pts.map((p, i) => (p != null ? i : -1)).filter((i) => i >= 0)
    if (idxs.length < 2) return ''
    const top = idxs.map((i) => ({ x: x(i), y: y(pts[i] as number) }))
    const curve = smoothPath(top).replace(/^M/, 'L')
    const first = idxs[0]
    const last = idxs[idxs.length - 1]
    return `M${x(first).toFixed(1)} ${(height - padB).toFixed(1)} ${curve} L${x(last).toFixed(1)} ${(height - padB).toFixed(1)} Z`
  }

  const gridVals: number[] = []
  for (let v = max; v >= min - 1e-9; v -= step) gridVals.push(v)

  const labelStep = n > 6 ? Math.ceil(n / 5) : 1
  const selValid = sel >= 0 && sel < n

  return (
    <div>
      {/* Caption / legend */}
      <div className="mb-1 flex h-5 items-center justify-between text-xs">
        <span className="truncate text-muted">{selValid ? labels[sel] : ''}</span>
        <span className="flex items-center gap-3">
          {series.map((s) => {
            const v = selValid ? s.points[sel] : null
            return (
              <span key={s.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-semibold tabular-nums text-content">
                  {v == null ? '—' : formatY(v)}
                </span>
              </span>
            )
          })}
        </span>
      </div>

      <div ref={ref} className="w-full touch-none select-none" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            onPointerDown={(e) => pickFromClientX(e.clientX)}
            onPointerMove={(e) => e.buttons === 1 && pickFromClientX(e.clientX)}
          >
            <defs>
              <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primary?.color ?? 'rgb(var(--c-income))'} stopOpacity="0.28" />
                <stop offset="100%" stopColor={primary?.color ?? 'rgb(var(--c-income))'} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines + y labels — labels sit in the padL gutter, to the
                left of where the plot itself starts, so they never overlap
                the curve. */}
            {gridVals.map((gv, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={y(gv)}
                  y2={y(gv)}
                  stroke="rgb(var(--c-border))"
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <text x={padL - 6} y={y(gv) - 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
                  {formatY(gv)}
                </text>
              </g>
            ))}

            {/* Selection guide */}
            {selValid && (
              <line
                x1={x(sel)}
                x2={x(sel)}
                y1={padT}
                y2={height - padB}
                stroke="rgb(var(--c-muted))"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
            )}

            {/* Series */}
            {series.map((s) => (
              <g key={s.name}>
                {s.fill && <path d={areaPath(s.points)} fill={`url(#fill-${gid})`} />}
                <path
                  d={buildPath(s.points)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '5 5' : undefined}
                />
              </g>
            ))}

            {/* End dots */}
            {series.map((s) => {
              if (!s.dot) return null
              const li = s.points.reduce<number>((acc, p, i) => (p != null ? i : acc), -1)
              if (li < 0) return null
              return (
                <circle
                  key={s.name + '-dot'}
                  cx={x(li)}
                  cy={y(s.points[li] as number)}
                  r={4}
                  fill={s.color}
                  stroke="rgb(var(--c-bg))"
                  strokeWidth={2}
                />
              )
            })}

            {/* Selection markers */}
            {selValid &&
              series.map((s) => {
                const v = s.points[sel]
                if (v == null) return null
                return (
                  <circle
                    key={s.name + '-sel'}
                    cx={x(sel)}
                    cy={y(v)}
                    r={3.5}
                    fill={s.color}
                    stroke="rgb(var(--c-surface))"
                    strokeWidth={1.5}
                  />
                )
              })}

            {/* X labels */}
            {labels.map((lb, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                  className="fill-muted"
                  style={{ fontSize: 10 }}
                >
                  {lb}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>

      {series.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-4 text-[0.6875rem] text-muted">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className={cn('inline-block h-0.5 w-4', s.dashed && 'opacity-70')}
                style={{
                  backgroundColor: s.color,
                  backgroundImage: s.dashed
                    ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 8px)`
                    : undefined,
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
