import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

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

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw) setW(cw)
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export default function LineChart({ series, labels, formatY, height = 190 }: Props) {
  const [ref, width] = useWidth()
  const gid = useId().replace(/[:]/g, '')

  const n = labels.length
  const padL = 6
  const padR = 6
  const padT = 16
  const padB = 20
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)

  const all = series.flatMap((s) => s.points.filter((p): p is number => p != null))
  let min = all.length ? Math.min(...all) : 0
  let max = all.length ? Math.max(...all) : 1
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.08
  min -= pad
  max += pad

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

  const buildPath = (pts: Array<number | null>) => {
    let d = ''
    let started = false
    pts.forEach((p, i) => {
      if (p == null) {
        started = false
        return
      }
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)} `
      started = true
    })
    return d.trim()
  }

  const areaPath = (pts: Array<number | null>) => {
    const idxs = pts.map((p, i) => (p != null ? i : -1)).filter((i) => i >= 0)
    if (idxs.length < 2) return ''
    const top = idxs.map((i) => `${x(i).toFixed(1)} ${y(pts[i] as number).toFixed(1)}`)
    const first = idxs[0]
    const last = idxs[idxs.length - 1]
    return `M${x(first).toFixed(1)} ${(height - padB).toFixed(1)} L${top.join(' L')} L${x(last).toFixed(1)} ${(height - padB).toFixed(1)} Z`
  }

  const gridVals = [max - pad, (min + max) / 2, min + pad]

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

            {/* Gridlines + y labels */}
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
                <text x={padL} y={y(gv) - 3} className="fill-muted" style={{ fontSize: 10 }}>
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
        <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-muted">
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
