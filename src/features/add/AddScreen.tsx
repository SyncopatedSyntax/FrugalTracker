import { useEffect, useMemo, useState } from 'react'
import Segmented from '@/components/Segmented'
import Sheet from '@/components/Sheet'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import TagInput from '@/components/TagInput'
import { Toast, useToast } from '@/components/Toast'
import { CalendarIcon, PencilIcon, TagIcon } from '@/components/icons'
import CategoryGrid from './CategoryGrid'
import AmountKeypad from './AmountKeypad'
import CategoryFormSheet from '@/features/categories/CategoryFormSheet'
import { useCategoriesByType, useSettings, useTags } from '@/hooks'
import { addTransaction } from '@/db/repo'
import { currencyDecimals, currencySymbol } from '@/lib/currency'
import { formatTypedAmount, parseAmount } from '@/lib/amount'
import { formatShortDate, todayISO } from '@/lib/date'
import type { TxType } from '@/db/types'
import { cn } from '@/lib/cn'

export default function AddScreen() {
  const settings = useSettings()
  const tagSuggestions = useTags().map((t) => t.name)
  const { message, show } = useToast()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState(todayISO())

  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [catFormOpen, setCatFormOpen] = useState(false)

  const activeCurrency = currency ?? settings.baseCurrency
  const decimals = currencyDecimals(activeCurrency)
  const symbol = currencySymbol(activeCurrency)

  const cats = useCategoriesByType(type)
  const sortedCats = useMemo(
    () => [...cats].sort((a, b) => b.usageCount - a.usageCount || a.sortOrder - b.sortOrder),
    [cats],
  )

  // Clear selection if the chosen category isn't in the current type list.
  useEffect(() => {
    if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId(null)
  }, [cats, categoryId])

  const amt = parseAmount(amount)
  const canSave = amt > 0 && !!categoryId

  const save = async () => {
    if (!canSave || !categoryId) return
    await addTransaction({
      type,
      amount: amt,
      currency: activeCurrency,
      categoryId,
      note: note.trim(),
      tags,
      date,
    })
    navigator.vibrate?.(12)
    show(type === 'expense' ? 'Expense saved' : 'Income saved')
    setAmount('')
    setNote('')
    setTags([])
    setDate(todayISO())
  }

  const dateLabel = date === todayISO() ? 'Today' : formatShortDate(date)

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top px-4 pt-2">
        <div className="flex justify-center">
          <Segmented
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={setType}
            activeClass={cn(
              'text-white shadow',
              type === 'expense' ? 'bg-expense' : 'bg-income',
            )}
          />
        </div>
      </div>

      {/* Amount */}
      <div className="flex flex-col items-center px-4 pt-3">
        <button
          onClick={() => setCurrencyOpen(true)}
          className="mb-1 rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted active:scale-95"
        >
          {activeCurrency}
        </button>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-medium text-muted">{symbol}</span>
          <span
            className={cn(
              'text-5xl font-bold tabular-nums',
              amt > 0 ? 'text-content' : 'text-muted/60',
            )}
          >
            {formatTypedAmount(amount)}
          </span>
        </div>
      </div>

      {/* Meta chips */}
      <div className="mt-3 flex items-center justify-center gap-2 px-4">
        <MetaChip icon={<CalendarIcon size={15} />} label={dateLabel} onClick={() => setDetailsOpen(true)} />
        <MetaChip
          icon={<PencilIcon size={15} />}
          label={note ? note : 'Note'}
          active={!!note}
          onClick={() => setDetailsOpen(true)}
        />
        <MetaChip
          icon={<TagIcon size={15} />}
          label={tags.length ? tags.map((t) => '#' + t).join(' ') : 'Tags'}
          active={tags.length > 0}
          onClick={() => setDetailsOpen(true)}
        />
      </div>

      {/* Categories */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 no-scrollbar">
        {sortedCats.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">
            No {type} categories yet. Tap “New” to create one.
          </p>
        ) : (
          <CategoryGrid
            categories={sortedCats}
            selectedId={categoryId}
            onSelect={setCategoryId}
            onAddNew={() => setCatFormOpen(true)}
          />
        )}
      </div>

      {/* Keypad */}
      <div className="border-t border-border bg-surface/60 px-1 pt-2">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          decimals={decimals}
          onSubmit={save}
          submitDisabled={!canSave}
          submitLabel={type === 'expense' ? 'Add expense' : 'Add income'}
          accent={type}
        />
      </div>

      <Toast message={message} />

      <CurrencyPickerSheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        value={activeCurrency}
        onSelect={setCurrency}
      />

      <CategoryFormSheet
        open={catFormOpen}
        onClose={() => setCatFormOpen(false)}
        defaultType={type}
        onSaved={(id) => setCategoryId(id)}
      />

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Details">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Date
            </span>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Note
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What was it for?"
              className="w-full resize-none rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Tags
            </span>
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>
          <button
            onClick={() => setDetailsOpen(false)}
            className="w-full rounded-2xl bg-primary py-3 text-base font-semibold text-primary-fg"
          >
            Done
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function MetaChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex max-w-[40%] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium active:scale-95',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-surface2 text-muted',
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
