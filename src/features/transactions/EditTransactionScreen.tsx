import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Segmented from '@/components/Segmented'
import Sheet from '@/components/Sheet'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import TagInput from '@/components/TagInput'
import CategoryFormSheet from '@/features/categories/CategoryFormSheet'
import CategoryGrid from '@/features/add/CategoryGrid'
import { ArrowLeftIcon, CheckIcon, TrashIcon } from '@/components/icons'
import { useCategoriesByType, useRateMap, useSettings, useTags, useTransaction } from '@/hooks'
import { deleteTransaction, updateTransaction } from '@/db/repo'
import { currencyDecimals, currencySymbol, formatMoney } from '@/lib/currency'
import { numberToTyped, parseAmount } from '@/lib/amount'
import { todayISO } from '@/lib/date'
import type { TxType } from '@/db/types'
import { cn } from '@/lib/cn'

/** Correcting an existing entry is a different job from logging a new one:
 * every field should be visible and editable at a glance, not walked through
 * step by step. So this is a single scrollable form (amount, currency, rate,
 * category, date, note, tags all on one screen) rather than the Add screen's
 * guided keypad flow. */
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
   * one (still editable) instead of carrying over a meaningless number. Also
   * re-clamp the amount's decimals to the new currency (e.g. USD → JPY). */
  const changeCurrency = (code: string) => {
    setCurrency(code)
    setRateText(code === settings.baseCurrency ? '1' : String(rates.get(code) ?? 1))
    setAmount((a) => clampDecimals(a, currencyDecimals(code)))
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

  const onAmountInput = (raw: string) => setAmount(clampDecimals(sanitizeAmount(raw), decimals))

  const amt = parseAmount(amount)
  const isBase = currency === settings.baseCurrency
  const parsedRate = parseFloat(rateText)
  const canSave = amt > 0 && !!categoryId

  const save = async () => {
    if (!canSave || !categoryId || !id) return
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

  const accent = type === 'expense' ? 'bg-expense' : 'bg-income'

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
        <h1 className="flex-1 text-lg font-semibold">Edit transaction</h1>
        <button
          onClick={() => setConfirmDelete(true)}
          className="grid h-10 w-10 place-items-center rounded-full text-expense hover:bg-expense/10"
          aria-label="Delete"
        >
          <TrashIcon size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 no-scrollbar">
        {/* Amount, type, currency & locked rate */}
        <section className="rounded-[22px] bg-surface p-5">
          <div className="flex justify-center">
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

          <div className="mt-4 flex flex-col items-center">
            <button
              onClick={() => setCurrencyOpen(true)}
              className="mb-1.5 rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted active:scale-95"
            >
              {currency}
            </button>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium text-muted">{symbol}</span>
              <input
                value={amount}
                onChange={(e) => onAmountInput(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount"
                style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }}
                className={cn(
                  'min-w-[1ch] max-w-full bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-muted/50',
                  amt > 0 ? 'text-content' : 'text-muted/60',
                )}
              />
            </div>

            {!isBase && (
              <div className="mt-2.5 flex flex-col items-center gap-0.5">
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
        </section>

        {/* Category */}
        <section className="rounded-[22px] bg-surface p-4">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Category
          </p>
          {sortedCats.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted">
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
        </section>

        {/* Date, note & tags */}
        <section className="space-y-4 rounded-[22px] bg-surface p-4">
          <label className="block">
            <span className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-wide text-muted">
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
            <span className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Note
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was it for?"
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>

          <div>
            <span className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Tags
            </span>
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </div>
        </section>
      </div>

      <div className="safe-bottom border-t border-border bg-surface/60 px-4 py-3">
        <button
          onClick={save}
          disabled={!canSave}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-[22px] py-3.5 text-base font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none',
            accent,
          )}
        >
          <CheckIcon size={20} />
          Save changes
        </button>
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

/** Keep only digits and a single decimal point. */
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, '')
  const dot = v.indexOf('.')
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
  return v
}

/** Trim the fractional part to the currency's decimal count (0 for JPY etc.). */
function clampDecimals(v: string, decimals: number): string {
  if (!v.includes('.')) return v
  if (decimals === 0) return v.replace(/\..*$/, '')
  const [intp, frac = ''] = v.split('.')
  return `${intp}.${frac.slice(0, decimals)}`
}
