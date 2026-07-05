import { cn } from '@/lib/cn'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

interface Props {
  slices: DonutSlice[]
  total: number
  centerLabel: string
  centerValue: string
  selectedKey: string | null
  onSelect: (key: string | null) => void
  size?: number
}

/** SVG donut. Slices are drawn with a small surface gap between them. */
export default function DonutChart({
  slices,
  total,
  centerLabel,
  centerValue,
  selectedKey,
  onSelect,
  size = 200,
}: Props) {
  const stroke = 26
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const gap = total > 0 ? Math.min(3, circ * 0.006) : 0

  let acc = 0

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto block"
      role="img"
      aria-label="Spending by category"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-surface2))"
          strokeWidth={stroke}
        />
        {total > 0 &&
          slices.map((s) => {
            const frac = s.value / total
            const arc = Math.max(0, frac * circ - gap)
            const dimmed = selectedKey && selectedKey !== s.key
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={selectedKey === s.key ? stroke + 4 : stroke}
                strokeDasharray={`${arc} ${circ - arc}`}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
                className={cn('cursor-pointer transition-opacity', dimmed && 'opacity-30')}
                onClick={() => onSelect(selectedKey === s.key ? null : s.key)}
              />
            )
            acc += frac * circ
            return el
          })}
      </g>
      <text
        x="50%"
        y="46%"
        textAnchor="middle"
        className="fill-muted text-[11px] font-medium"
        style={{ fontSize: 11 }}
      >
        {centerLabel}
      </text>
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        className="fill-content font-bold"
        style={{ fontSize: 20 }}
      >
        {centerValue}
      </text>
    </svg>
  )
}
