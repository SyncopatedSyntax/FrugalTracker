import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Segmented from '@/components/Segmented'
import Sheet from '@/components/Sheet'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import TagInput from '@/components/TagInput'
import CategoryFormSheet from '@/features/categories/CategoryFormSheet'
import CategoryGrid from '@/features/add/CategoryGrid'
import AmountKeypad from '@/features/add/AmountKeypad'
import { ArrowLeftIcon, CalendarIcon, PencilIcon, TagIcon, TrashIcon } from '@/components/icons'
import { useCategoriesByType, useRateMap, useSettings, useTags, useTransaction } from '@/hooks'
import { deleteTransaction, updateTransaction } from '@/db/repo'
import { currencyDecimals, currencySymbol, formatMoney } from '@/lib/currency'
import { formatTypedAmount, numberToTyped, parseAmount } from '@/lib/amount'
import { formatShortDate, todayISO } from '@/lib/date'
import type { TxType } from '@/db/types'
import { cn } from '@/lib/cn'

export default function EditTransactionScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const tx = useTransaction(id)
  const tagSuggestions = useTags().map((t) => t.name)
  const settings = useSettings()
  const rates = useRateMap()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState(todayISO())
  // The exchange rate locked in for this entry (1 unit of `currency` in the
  // base currency). Defaults to the transaction's originally-locked rate so
  // editing the amount alone doesn't drift it; editable so the user can
  // correct it explicitly. See Transaction.baseRate.
  const [rateText, setRateText] = useState('1')

  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [catFormOpen, setCatFormOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const seeded = useRef(false)
  useEffect(() => {
    if (tx && !seeded.current) {
      seeded.current = true
      setType(tx.type)
      setAmount(numberToTyped(tx.amount))
      setCurrency(tx.currency)
      setCategoryId(tx.categoryId)
      setNote(tx.note)
      setTags(tx.tags)
      setDate(tx.date)
      setRateText(String(tx.baseRate ?? 1))
    }
  }, [tx])

  /** The currency picker changed currency — the previously-locked rate
   * belongs to the old currency, so suggest today's live rate for the new
   * one (still editable) instead of carrying over a meaningless number. */
  const changeCurrency = (code: string) => {
    setCurrency(code)
    setRateText(code === settings.baseCurrency ? '1' : String(rates.get(code) ?? 1))
  }

  const decimals = currencyDecimals(currency)
  const symbol = currencySymbol(currency)
  const cats = useCategoriesByType(type)
  const sortedCats = useMemo(
    () => [...cats].sort((a, b) => b.usageCount - a.usageCount || a.sortOrder - b.sortOrder),
    [cats],
  )

  useEffect(() => {
    if (categoryId && cats.length && !cats.some((c) => c.id === categoryId)) {
      setCategoryId(null)
    }
  }, [cats, categoryId])

  const amt = parseAmount(amount)
  const canSave = amt > 0 && !!categoryId

  const save = async () => {
    if (!canSave || !categoryId || !id) return
    const isBase = currency === settings.baseCurrency
    const parsedRate = parseFloat(rateText)
    await updateTransaction(
      id,
      {
        type,
        amount: amt,
        currency,
        categoryId,
        note: note.trim(),
        tags,
        date,
      },
      { baseRateOverride: isBase ? 1 : Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : undefined },
    )
    navigate(-1)
  }

  const remove = async () => {
    if (!id) return
    await deleteTransaction(id)
    navigate(-1)
  }

  if (tx === undefined && !seeded.current) {
    return (
      <div className="mx-auto flex h-full max-w-lg items-center justify-center text-muted">
        Loading…
      </div>
    )
  }

  const dateLabel = date === todayISO() ? 'Today' : formatShortDate(date)

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-bg">
      <header className="safe-top flex items-center gap-1 border-b border-border bg-surface/95 px-2 py-2 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface2"
          aria-label="Back"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">Edit</h1>
        <button
          onClick={() => setConfirmDelete(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-expense hover:bg-expense/10"
          aria-label="Delete"
        >
          <TrashIcon size={20} />
        </button>
      </header>

      <div className="flex justify-center pt-3">
        <Segmented
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={setType}
          activeClass={cn('text-white shadow', type === 'expense' ? 'bg-expense' : 'bg-income')}
        />
      </div>

      <div className="flex flex-col items-center px-4 pt-3">
        <button
          onClick={() => setCurrencyOpen(true)}
          className="mb-1 rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted active:scale-95"
        >
          {currency}
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
        {currency !== settings.baseCurrency && (
          <div className="mt-1.5 flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span>1 {currency} =</span>
              <input
                type="number"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
                className="w-20 rounded-lg border border-border bg-surface2 px-2 py-1 text-center text-xs tabular-nums outline-none focus:border-primary"
                aria-label="Exchange rate"
              />
              <span>{settings.baseCurrency}</span>
            </div>
            <span className="text-[11px] text-muted">
              ≈ {formatMoney(amt * (parseFloat(rateText) || 0), settings.baseCurrency)} locked in
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 px-4">
        <Chip icon={<CalendarIcon size={15} />} label={dateLabel} onClick={() => setDetailsOpen(true)} />
        <Chip
          icon={<PencilIcon size={15} />}
          label={note || 'Note'}
          active={!!note}
          onClick={() => setDetailsOpen(true)}
        />
        <Chip
          icon={<TagIcon size={15} />}
          label={tags.length ? tags.map((t) => '#' + t).join(' ') : 'Tags'}
          active={tags.length > 0}
          onClick={() => setDetailsOpen(true)}
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 no-scrollbar">
        <CategoryGrid
          categories={sortedCats}
          selectedId={categoryId}
          onSelect={setCategoryId}
          onAddNew={() => setCatFormOpen(true)}
        />
      </div>

      <div className="border-t border-border bg-surface/60 px-1 pt-2">
        <AmountKeypad
          value={amount}
          onChange={setAmount}
          decimals={decimals}
          onSubmit={save}
          submitDisabled={!canSave}
          submitLabel="Save changes"
          accent={type}
        />
      </div>

      <CurrencyPickerSheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        value={currency}
        onSelect={changeCurrency}
      />

      <CategoryFormSheet
        open={catFormOpen}
        onClose={() => setCatFormOpen(false)}
        defaultType={type}
        onSaved={(cid) => setCategoryId(cid)}
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
            className="w-full rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg"
          >
            Done
          </button>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete transaction?">
        <p className="text-sm text-muted">This can’t be undone.</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="flex-1 rounded-[22px] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={remove}
            className="flex-1 rounded-[22px] bg-expense py-3 text-sm font-semibold text-white"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function Chip({
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
        active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-surface2 text-muted',
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
