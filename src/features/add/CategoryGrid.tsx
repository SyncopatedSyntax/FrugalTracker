import type { Category } from '@/db/types'
import { cn } from '@/lib/cn'
import { PlusIcon } from '@/components/icons'

interface Props {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddNew?: () => void
}

export default function CategoryGrid({ categories, selectedId, onSelect, onAddNew }: Props) {
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-5">
      {categories.map((c) => {
        const active = c.id === selectedId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="flex flex-col items-center gap-1 rounded-xl py-1 transition-transform active:scale-95"
          >
            <span
              className={cn(
                'grid h-12 w-12 place-items-center rounded-full text-2xl transition-all',
                active ? 'ring-2 ring-offset-2 ring-offset-bg' : 'opacity-95',
              )}
              style={{
                backgroundColor: active ? c.color : c.color + '22',
                ...(active ? ({ ['--tw-ring-color']: c.color } as React.CSSProperties) : {}),
              }}
            >
              {c.icon}
            </span>
            <span
              className={cn(
                'w-full truncate px-0.5 text-center text-[11px] leading-tight',
                active ? 'font-semibold text-content' : 'text-muted',
              )}
            >
              {c.name}
            </span>
          </button>
        )
      })}
      {onAddNew && (
        <button
          type="button"
          onClick={onAddNew}
          className="flex flex-col items-center gap-1 rounded-xl py-1 transition-transform active:scale-95"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-border text-muted">
            <PlusIcon size={22} />
          </span>
          <span className="text-[11px] leading-tight text-muted">New</span>
        </button>
      )}
    </div>
  )
}
