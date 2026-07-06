import { cn } from '@/lib/cn'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
  icon?: string
}

interface Props {
  slices: DonutSlice[]
  total: number
  centerLabel: string
  centerValue: string
  selectedKey: string | null
  onSelect: (key: string | null) => void
  /** Square SVG size; the ring sits inside with room for icon bubbles + labels. */
  size?: number
}

/** Donut with category icon bubbles and % labels arranged around the ring. */
export default function DonutChart({
  slices,
  total,
  centerLabel,
  centerValue,
  selectedKey,
  onSelect,
  size = 280,
}: Props) {
  const c = size / 2
  const stroke = Math.round(size * 0.085)
  const r = size * 0.29
  const circ = 2 * Math.PI * r
  const gap = total > 0 && slices.length > 1 ? circ * 0.006 : 0

  const bubbleR = size * 0.05
  const bubbleCenterR = r + stroke / 2 + bubbleR + 10
  // Gap beyond the bubble's own edge, along the radial direction. This needs
  // to clear the label text's *half-width* too, not just its height — for a
  // bubble sitting near the left/right of the ring, the radial direction is
  // almost purely horizontal, so a small flat gap (which reads fine above a
  // bubble near the top) leaves the center-anchored text overlapping the
  // bubble on that side. Scaling with `size` (rather than a flat constant)
  // keeps it wide enough for the longest label ("9.9%"/"100%") at any size.
  const labelR = bubbleCenterR + bubbleR + size * 0.08
  // Wide enough that a label sitting at the ring's left/right extreme (where
  // labelR contributes almost entirely to horizontal position) still clears
  // the viewBox with its own half-width to spare — otherwise a wider gap here
  // just clips the text at the SVG edge instead of overlapping the bubble.
  const pad = labelR - c + size * 0.09

  // Precompute slice angles (start at top, clockwise).
  let acc = 0
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0
    const startFrac = acc
    acc += frac
    const midFrac = startFrac + frac / 2
    const midAngle = midFrac * 2 * Math.PI - Math.PI / 2
    return { s, frac, startFrac, midAngle }
  })

  // Only bubble the meaningful slices to avoid clutter.
  const bubbleThreshold = 0.03
  const bubbled = arcs.filter((a) => a.frac >= bubbleThreshold).slice(0, 10)

  let dashAcc = 0

  return (
    <svg
      width="100%"
      viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
      className="mx-auto block"
      style={{ maxWidth: size + pad * 2 }}
      role="img"
      aria-label="Breakdown by category"
    >
      {/* Track */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--c-surface2))" strokeWidth={stroke} />

      {/* Slices */}
      <g transform={`rotate(-90 ${c} ${c})`}>
        {arcs.map(({ s, frac }) => {
          const arc = Math.max(0, frac * circ - gap)
          const dimmed = selectedKey && selectedKey !== s.key
          const el = (
            <circle
              key={s.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={selectedKey === s.key ? stroke + 5 : stroke}
              strokeDasharray={`${arc} ${circ - arc}`}
              strokeDashoffset={-dashAcc}
              className={cn('cursor-pointer transition-opacity', dimmed && 'opacity-30')}
              onClick={() => onSelect(selectedKey === s.key ? null : s.key)}
            />
          )
          dashAcc += frac * circ
          return el
        })}
      </g>

      {/* Connectors + icon bubbles + % labels */}
      {bubbled.map(({ s, frac, midAngle }) => {
        const cos = Math.cos(midAngle)
        const sin = Math.sin(midAngle)
        const bx = c + bubbleCenterR * cos
        const by = c + bubbleCenterR * sin
        const lx = c + labelR * cos
        const ly = c + labelR * sin
        const ex = c + (r + stroke / 2) * cos
        const ey = c + (r + stroke / 2) * sin
        const dimmed = selectedKey && selectedKey !== s.key
        return (
          <g
            key={s.key}
            className={cn('cursor-pointer transition-opacity', dimmed && 'opacity-30')}
            onClick={() => onSelect(selectedKey === s.key ? null : s.key)}
          >
            <line x1={ex} y1={ey} x2={bx} y2={by} stroke={s.color} strokeWidth={1.5} strokeOpacity={0.5} />
            <circle cx={bx} cy={by} r={bubbleR} fill={s.color} />
            <text
              x={bx}
              y={by}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: bubbleR * 1.1 }}
            >
              {s.icon ?? ''}
            </text>
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted font-semibold"
              style={{ fontSize: size * 0.042 }}
            >
              {(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%
            </text>
          </g>
        )
      })}

      {/* Center */}
      <text
        x={c}
        y={c - size * 0.03}
        textAnchor="middle"
        className="fill-muted"
        style={{ fontSize: size * 0.045 }}
      >
        {centerLabel}
      </text>
      <text
        x={c}
        y={c + size * 0.04}
        textAnchor="middle"
        className="fill-content font-bold"
        style={{ fontSize: size * 0.075 }}
      >
        {centerValue}
      </text>
    </svg>
  )
}
