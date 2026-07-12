import { useEffect, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import Segmented from '@/components/Segmented'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import TagInput from '@/components/TagInput'
import { Toast, useToast } from '@/components/Toast'
import { PlusIcon, TrashIcon } from '@/components/icons'
import {
  useCategoriesByType,
  useCategoryMap,
  useDemoMode,
  useRecurringTransactions,
  useSettings,
  useTags,
} from '@/hooks'
import {
  addRecurringTransaction,
  deleteRecurringTransaction,
  updateRecurringTransaction,
} from '@/db/recurring'
import type { RecurrenceFrequency, RecurringTransaction, TxType } from '@/db/types'
import { currencySymbol, formatMoney } from '@/lib/currency'
import { formatShortDate, todayISO } from '@/lib/date'
import { alphaHex } from '@/lib/palette'
import { FREQUENCIES, FREQUENCY_LABELS } from '@/lib/recurrence'
import { cn } from '@/lib/cn'

export default function RecurringScreen() {
  const settings = useSettings()
  const chipAlpha = alphaHex(settings.categoryIconAlpha)
  const rules = useRecurringTransactions()
  const categoryMap = useCategoryMap()
  const isDemo = useDemoMode()
  const { message, show } = useToast()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTransaction | undefined>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <SubScreen
      title="Recurring"
      right={
        <button
          onClick={() => {
            setEditing(undefined)
            setOpen(true)
          }}
          disabled={isDemo}
          className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-40"
          aria-label="Add recurring transaction"
        >
          <PlusIcon size={22} />
        </button>
      }
    >
      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-muted">
          Automatically added to Activity on their due date — never before.
        </p>

        {isDemo && (
          <p className="mb-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
            Paused while Demo Mode is active — exit demo mode to manage recurring transactions.
          </p>
        )}

        {rules.length === 0 ? (
          <div className="rounded-[1.375rem] bg-surface p-8 text-center">
            <p className="text-4xl">🔁</p>
            <p className="mt-3 text-sm text-muted">
              No recurring transactions yet. Tap + to set up rent, a subscription, or your salary.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((r) => {
              const cat = categoryMap.get(r.categoryId)
              const ended = !!r.endDate && r.nextDueDate > r.endDate
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setEditing(r)
                    setOpen(true)
                  }}
                  disabled={isDemo}
                  className="flex w-full items-center gap-3 rounded-[1.375rem] bg-surface p-4 text-left disabled:opacity-60"
                >
                  <span
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-lg"
                    style={{ backgroundColor: (cat?.color ?? '#64748b') + chipAlpha }}
                  >
                    {cat?.icon ?? '❓'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {cat?.name ?? 'Uncategorized'}
                    </span>
                    <span className="block text-xs text-muted">
                      {FREQUENCY_LABELS[r.frequency]} · {ended ? 'Ended' : `Next ${formatShortDate(r.nextDueDate)}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex-shrink-0 text-sm font-semibold tabular-nums',
                      r.type === 'expense' ? 'text-expense' : 'text-income',
                    )}
                  >
                    {r.type === 'expense' ? '-' : '+'}
                    {formatMoney(r.amount, r.currency)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Toast message={message} />

      <RecurringFormSheet
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        onDeleteRequest={() => setConfirmDelete(true)}
        onSaved={() => {
          setOpen(false)
          show(editing ? 'Recurring transaction updated' : 'Recurring transaction created')
        }}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete recurring transaction?"
      >
        <p className="text-sm text-muted">
          Stops future occurrences. Transactions it already added stay in your Activity log.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmDelete(false)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (editing) await deleteRecurringTransaction(editing.id)
              setConfirmDelete(false)
              setOpen(false)
              show('Recurring transaction deleted')
            }}
            className="flex-1 rounded-[1.375rem] bg-expense py-3 text-sm font-semibold text-white"
          >
            Delete
          </button>
        </div>
      </Sheet>
    </SubScreen>
  )
}

function RecurringFormSheet({
  open,
  onClose,
  editing,
  onSaved,
  onDeleteRequest,
}: {
  open: boolean
  onClose: () => void
  editing?: RecurringTransaction
  onSaved: () => void
  onDeleteRequest: () => void
}) {
  const settings = useSettings()
  const base = settings.baseCurrency
  const tagSuggestions = useTags().map((t) => t.name)

  const [type, setType] = useState<TxType>('expense')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(base)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [startDate, setStartDate] = useState(todayISO())
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const cats = useCategoriesByType(type)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setType(editing.type)
      setCategoryId(editing.categoryId)
      setAmount(String(editing.amount))
      setCurrency(editing.currency)
      setFrequency(editing.frequency)
      setStartDate(editing.startDate)
      setHasEndDate(!!editing.endDate)
      setEndDate(editing.endDate ?? '')
      setNote(editing.note)
      setTags(editing.tags)
    } else {
      setType('expense')
      setCategoryId(null)
      setAmount('')
      setCurrency(base)
      setFrequency('monthly')
      setStartDate(todayISO())
      setHasEndDate(false)
      setEndDate('')
      setNote('')
      setTags([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  // Clear the category if switching type invalidates the current selection.
  useEffect(() => {
    if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId(null)
  }, [cats, categoryId])

  const amt = parseFloat(amount)
  const canSave =
    Number.isFinite(amt) &&
    amt > 0 &&
    !!categoryId &&
    !!startDate &&
    (!hasEndDate || (!!endDate && endDate >= startDate))

  const save = async () => {
    if (!canSave || !categoryId) return
    const input = {
      type,
      amount: amt,
      currency,
      categoryId,
      note: note.trim(),
      tags,
      frequency,
      startDate,
      endDate: hasEndDate ? endDate : null,
    }
    if (editing) {
      await updateRecurringTransaction(editing.id, input)
    } else {
      await addRecurringTransaction(input)
    }
    onSaved()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit recurring transaction' : 'New recurring transaction'}
      className="h-[88vh]"
    >
      <div className="space-y-4">
        <Segmented
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={setType}
          activeClass={cn('text-white shadow', type === 'expense' ? 'bg-expense' : 'bg-income')}
        />

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
          <div className="flex flex-wrap gap-1.5">
            {cats.length === 0 && (
              <p className="text-sm text-muted">No {type} categories yet.</p>
            )}
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium',
                  categoryId === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted',
                )}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Amount
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3">
              <span className="text-muted">{currencySymbol(currency)}</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent py-3 text-base outline-none"
              />
            </div>
          </label>
          <label className="w-24 flex-shrink-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Currency
            </span>
            <button
              type="button"
              onClick={() => setCurrencyOpen(true)}
              className="flex h-[50px] w-full items-center justify-center rounded-xl border border-border bg-surface2 text-sm font-semibold"
            >
              {currency}
            </button>
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Repeats</p>
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium',
                  frequency === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted',
                )}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Starts
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3.5 py-3">
          <span className="text-sm font-medium">End on a date</span>
          <input
            type="checkbox"
            checked={hasEndDate}
            onChange={(e) => setHasEndDate(e.target.checked)}
            className="h-5 w-5 flex-shrink-0 accent-[rgb(var(--c-primary))]"
            aria-label="Set an end date"
          />
        </label>

        {hasEndDate && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              Ends
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-sm outline-none focus:border-primary"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Note
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's it for?"
            className="w-full rounded-xl border border-border bg-surface2 px-3.5 py-3 text-sm outline-none focus:border-primary"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Tags
          </span>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            placeholder="Add a tag…"
          />
        </div>

        <div className="flex gap-2 pb-1">
          {editing && (
            <button
              onClick={onDeleteRequest}
              className="grid w-12 flex-shrink-0 place-items-center rounded-[1.375rem] border border-border text-expense"
              aria-label="Delete recurring transaction"
            >
              <TrashIcon size={20} />
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave}
            className="flex-1 rounded-[1.375rem] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-40"
          >
            {editing ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>

      <CurrencyPickerSheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        value={currency}
        onSelect={setCurrency}
      />
    </Sheet>
  )
}
