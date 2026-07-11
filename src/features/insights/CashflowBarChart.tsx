import { useEffect, useState } from 'react'
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
  const padL = 6
  const padR = 6
  const padT = 16
  const padB = 20
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)

  const realIncome = income.slice(0, lastIdx + 1)
  const realExpense = expense.slice(0, lastIdx + 1)
  const realNet = net.slice(0, lastIdx + 1)
  const maxAbs = Math.max(1, ...realIncome, ...realExpense, ...realNet.map(Math.abs))
  const domain = maxAbs * 1.12

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW)
  const y = (v: number) => padT + (1 - (v + domain) / (domain * 2)) * innerH
  const zeroY = y(0)

  const slot = n > 0 ? innerW / n : innerW
  const barW = Math.min(26, slot * 0.5)
  const placeholderH = innerH * 0.05

  const lastActual = lastIdx
  const [sel, setSel] = useState(lastActual)
  useEffect(() => setSel(lastActual), [lastActual, n])

  const pickFromClientX = (clientX: number) => {
    if (!ref.current || n <= 1) return
    const rect = ref.current.getBoundingClientRect()
    const rel = clientX - rect.left - padL
    const idx = Math.round((rel / innerW) * (n - 1))
    setSel(Math.max(0, Math.min(n - 1, idx)))
  }

  const netPath = realNet
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')

  const gridVals = [domain, 0, -domain]
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
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-primary))' }} />
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

            {/* Net cash flow line (per-bucket, not cumulative) */}
            <path
              d={netPath}
              fill="none"
              stroke="rgb(var(--c-primary))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {realNet.map((v, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={2.5}
                fill="rgb(var(--c-primary))"
                stroke="rgb(var(--c-surface))"
                strokeWidth={1}
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
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: 'rgb(var(--c-primary))' }} />
          Net
        </span>
      </div>
    </div>
  )
}
