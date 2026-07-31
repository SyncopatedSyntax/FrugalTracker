import Sheet from '@/components/Sheet'
import type { TxType } from '@/db/types'
import { formatMoneyCompact } from '@/lib/currency'
import DonutChart from './DonutChart'
import SliceRow from './SliceRow'
import type { Slice } from './compute'

/** Category picker for the Labels view's filter, presented as the Categories
 * screen in miniature — the same donut and the same rows — so choosing a
 * category to narrow labels by is the familiar view rather than a new one.
 * Tapping either a slice or a row applies the filter and closes; tapping the
 * one already applied clears it back to all categories. */
export default function CategoryPickerSheet({
  open,
  onClose,
  slices,
  total,
  base,
  chipAlpha,
  flow,
  selectedKey,
  onPick,
}: {
  open: boolean
  onClose: () => void
  slices: Slice[]
  /** The flow's total across *all* categories, so shares read as a
   * percentage of everything — matching the Categories screen. */
  total: number
  base: string
  chipAlpha: string
  flow: TxType
  selectedKey: string | null
  onPick: (id: string | null) => void
}) {
  const selected = selectedKey ? slices.find((s) => s.key === selectedKey) : undefined
  const maxVal = slices.reduce((m, s) => (s.value > m ? s.value : m), 0)

  const pick = (id: string | null) => {
    onPick(id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Filter by category" className="h-[85vh]">
      {slices.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          No {flow === 'expense' ? 'expenses' : 'income'} in this period.
        </p>
      ) : (
        <>
          <DonutChart
            slices={slices.map((s) => ({
              key: s.key,
              label: s.name,
              value: s.share,
              color: s.color,
              icon: s.icon,
            }))}
            total={total}
            centerLabel={selected ? selected.name : 'Total'}
            centerValue={formatMoneyCompact(selected ? selected.value : total, base)}
            selectedKey={selectedKey}
            // DonutChart hands back null when the already-selected slice is
            // tapped, which lands here as "clear the filter" — the same
            // meaning as the All categories chip.
            onSelect={pick}
          />

          <div className="mt-4 space-y-1">
            {slices.map((s) => (
              <SliceRow
                key={s.key}
                slice={s}
                kind="category"
                flow={flow}
                base={base}
                chipAlpha={chipAlpha}
                maxVal={maxVal}
                total={total}
                active={selectedKey === s.key}
                onClick={() => pick(selectedKey === s.key ? null : s.key)}
              />
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}
