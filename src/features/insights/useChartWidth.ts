import { useEffect, useRef, useState } from 'react'

/** Tracks a container's rendered width so an SVG chart inside it can size
 * itself responsively (shared by LineChart and CashflowBarChart). */
export function useChartWidth(): [React.RefObject<HTMLDivElement>, number] {
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
