import { useEffect, useState } from 'react'
import Sheet from '@/components/Sheet'
import Segmented from '@/components/Segmented'
import { useCategories, useTags } from '@/hooks'
import { cn } from '@/lib/cn'
import { emptyFilters, type Filters } from './filters'

interface Props {
  open: boolean
  onClose: () => void
  filters: Filters
  onApply: (f: Filters) => void
}

export default function FilterSheet({ open, onClose, filters, onApply }: Props) {
  const categories = useCategories(true)
  const tags = useTags()
  const [draft, setDraft] = useState<Filters>(filters)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  const toggleCategory = (id: string) =>
    setDraft((d) => ({
      ...d,
      categoryIds: d.categoryIds.includes(id)
        ? d.categoryIds.filter((x) => x !== id)
        : [...d.categoryIds, id],
    }))

  const toggleTag = (name: string) =>
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(name) ? d.tags.filter((x) => x !== name) : [...d.tags, name],
    }))

  const visibleCats = categories.filter((c) => draft.type === 'all' || c.type === draft.type)

  return (
    <Sheet open={open} onClose={onClose} title="Filters" className="h-[85vh]">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Type</p>
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={draft.type}
            onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Categories
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleCats.map((c) => {
              const on = draft.categoryIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium',
                    on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted',
                  )}
                >
                  <span>{c.icon}</span>
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = draft.tags.includes(t.name)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={cn(
                      'rounded-full border px-2.5 py-1.5 text-xs font-medium',
                      on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted',
                    )}
                  >
                    #{t.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Date range
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={draft.from ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || null }))}
              className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-muted">–</span>
            <input
              type="date"
              value={draft.to ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || null }))}
              className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setDraft(emptyFilters)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold text-muted"
          >
            Clear all
          </button>
          <button
            onClick={() => {
              onApply(draft)
              onClose()
            }}
            className="flex-[2] rounded-[1.375rem] bg-primary py-3 text-sm font-semibold text-primary-fg"
          >
            Show results
          </button>
        </div>
      </div>
    </Sheet>
  )
}
