import { useState } from 'react'
import Sheet from './Sheet'
import { CURRENCIES } from '@/lib/currency'
import { cn } from '@/lib/cn'
import { CheckIcon } from './icons'

interface Props {
  open: boolean
  onClose: () => void
  value: string
  onSelect: (code: string) => void
}

export default function CurrencyPickerSheet({ open, onClose, value, onSelect }: Props) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = query
    ? CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query),
      )
    : CURRENCIES

  return (
    <Sheet open={open} onClose={onClose} title="Currency" className="h-[70vh]">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search currency…"
        className="mb-3 w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="space-y-1">
        {list.map((c) => (
          <button
            key={c.code}
            onClick={() => {
              onSelect(c.code)
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
              c.code === value ? 'bg-primary/10' : 'hover:bg-surface2',
            )}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-sm font-semibold">
              {c.symbol}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{c.code}</span>
              <span className="block text-xs text-muted">{c.name}</span>
            </span>
            {c.code === value && <CheckIcon size={18} className="text-primary" />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
