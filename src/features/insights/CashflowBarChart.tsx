import { useEffect, useState } from 'react'
import { niceStep } from './niceTicks'
import { useChartWidth } from './useChartWidth'

interface Props {
  /** Per-bucket income, expense (positive magnitude), and net (income −
   * expense *for that bucket*, not a running total). */
  income: number[]
  expense: number[]
  net: number[]
  labels: string[]
  formatY: (n: number) => string
  /** Buckets beyond this index haven't started yet — drawn as a neutral
   * placeholder rather than a zero bar, so "no data" reads differently from
   * "started with nothing in it". */
  lastIdx: number
  height?: number
}

/** Diverging income/expense bars (income up, expense down from a shared
 * zero baseline, à la a cash-flow "candlestick") with the per-bucket net
 * overlaid as a line. */
export default function CashflowBarChart({
  income,
  expense,
  net,
  labels,
  formatY,
  lastIdx,
  height = 190,
}: Props) {
  const [ref, width] = useChartWidth()

  const n = labels.length
  // padL reserves a gutter for the y-axis labels (wider than LineChart's,
  // since these labels can carry a "-" sign), so bars never sit under them.
  const padL = 44
  const padR = 8
  const padT = 16
  const padB = 20
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)

  const realIncome = income.slice(0, lastIdx + 1)
  const realExpense = expense.slice(0, lastIdx + 1)
  const realNet = net.slice(0, lastIdx + 1)
  const maxAbs = Math.max(1, ...realIncome, ...realExpense, ...realNet.map(Math.abs))
  const step = niceStep(maxAbs / 2)
  const domain = step * 2

  // A band scale (each bar centered in its own slot) rather than a point
  // scale — a point scale puts the first/last bar centers exactly on the
  // plot edges, so a wide bar there would overhang into the label gutter.
  const slot = n > 0 ? innerW / n : innerW
  const x = (i: number) => padL + (i + 0.5) * slot
  const y = (v: number) => padT + (1 - (v + domain) / (domain * 2)) * innerH
  const zeroY = y(0)

  const barW = Math.min(34, slot * 0.82)
  const placeholderH = innerH * 0.05

  const lastActual = lastIdx
  const [sel, setSel] = useState(lastActual)
  useEffect(() => setSel(lastActual), [lastActual, n])

  const pickFromClientX = (clientX: number) => {
    if (!ref.current || n <= 1) return
    const rect = ref.current.getBoundingClientRect()
    const rel = clientX - rect.left - padL
    const idx = Math.floor(rel / slot)
    setSel(Math.max(0, Math.min(n - 1, idx)))
  }

  const netPath = realNet
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')

  const gridVals = [2, 1, 0, -1, -2].map((k) => k * step)
  const labelStep = n > 6 ? Math.ceil(n / 5) : 1
  const selValid = sel >= 0 && sel < n
  const selReal = selValid && sel <= lastIdx

  return (
    <div>
      {/* Caption / legend */}
      <div className="mb-1 flex h-5 items-center justify-between text-xs">
        <span className="truncate text-muted">{selValid ? labels[sel] : ''}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-income))' }} />
            <span className="font-semibold tabular-nums text-content">
              {selReal ? formatY(income[sel]) : '—'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-expense))' }} />
            <span className="font-semibold tabular-nums text-content">
              {selReal ? '-' + formatY(expense[sel]) : '—'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-net))' }} />
            <span className="font-semibold tabular-nums text-content">
              {selReal ? formatY(net[sel]) : '—'}
            </span>
          </span>
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
            {/* Gridlines + y labels — labels sit in the padL gutter, to the
                left of where the plot itself starts, so they never overlap
                a bar. */}
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

            {/* Diverging income/expense bars */}
            {labels.map((_, i) => {
              const cx = x(i)
              if (i > lastIdx) {
                return (
                  <rect
                    key={i}
                    x={cx - barW / 2}
                    y={zeroY - placeholderH}
                    width={barW}
                    height={placeholderH * 2}
                    rx={3}
                    fill="rgb(var(--c-border))"
                  />
                )
              }
              return (
                <g key={i}>
                  {income[i] > 0 && (
                    <rect
                      x={cx - barW / 2}
                      y={y(income[i])}
                      width={barW}
                      height={zeroY - y(income[i])}
                      rx={3}
                      fill="rgb(var(--c-income))"
                    />
                  )}
                  {expense[i] > 0 && (
                    <rect
                      x={cx - barW / 2}
                      y={zeroY}
                      width={barW}
                      height={y(-expense[i]) - zeroY}
                      rx={3}
                      fill="rgb(var(--c-expense))"
                    />
                  )}
                </g>
              )
            })}

            {/* Zero axis */}
            <line
              x1={padL}
              x2={width - padR}
              y1={zeroY}
              y2={zeroY}
              stroke="rgb(var(--c-muted))"
              strokeWidth={1}
              strokeOpacity={0.5}
            />

            {/* Net cash flow line (per-bucket, not cumulative). A background
                casing in the card's own surface color is drawn first, so the
                line keeps a clean edge whichever bar color it crosses, then
                the real line on top — that contrast, not a louder color, is
                what keeps the net line legible against every bar. */}
            <path
              d={netPath}
              fill="none"
              stroke="rgb(var(--c-surface))"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.9}
            />
            <path
              d={netPath}
              fill="none"
              stroke="rgb(var(--c-net))"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {realNet.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={4}
                fill="rgb(var(--c-net))"
                stroke="rgb(var(--c-surface))"
                strokeWidth={2}
              />
            ))}

            {/* Selection markers */}
            {selReal && (
              <>
                {income[sel] > 0 && (
                  <circle
                    cx={x(sel)}
                    cy={y(income[sel])}
                    r={3.5}
                    fill="rgb(var(--c-income))"
                    stroke="rgb(var(--c-surface))"
                    strokeWidth={1.5}
                  />
                )}
                {expense[sel] > 0 && (
                  <circle
                    cx={x(sel)}
                    cy={y(-expense[sel])}
                    r={3.5}
                    fill="rgb(var(--c-expense))"
                    stroke="rgb(var(--c-surface))"
                    strokeWidth={1.5}
                  />
                )}
              </>
            )}

            {/* X labels */}
            {labels.map((lb, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  textAnchor="middle"
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

      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-income))' }} />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-expense))' }} />
          Expense
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: 'rgb(var(--c-net))' }} />
          Net
        </span>
      </div>
    </div>
  )
}
