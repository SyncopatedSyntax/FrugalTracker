import { useEffect, useState } from 'react'
import Sheet from '@/components/Sheet'
import { TrashIcon } from '@/components/icons'
import { useBudgets, useCategoriesByType, useSettings } from '@/hooks'
import { deleteBudget, setBudget } from '@/db/repo'
import type { Budget } from '@/db/types'
import { currencySymbol } from '@/lib/currency'
import { runWrite } from '@/lib/write'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
  /** The budget being edited, or undefined to create a new one. */
  editing?: Budget
  /** Called after a delete, so a host detail screen can navigate away. */
  onDeleted?: () => void
}

/** Add / edit / delete a monthly budget. Shared by the budgets overview
 * (create) and the budget detail screen (edit) so the form lives in one
 * place. Manages its own category + amount state, keyed off `open`. */
export default function BudgetFormSheet({ open, onClose, editing, onDeleted }: Props) {
  const settings = useSettings()
  const base = settings.baseCurrency
  const budgets = useBudgets()
  const expenseCats = useCategoriesByType('expense')

  const [catId, setCatId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const usedCatKeys = new Set(budgets.map((b) => b.categoryId ?? '__overall__'))
  // A category is off-limits if some *other* budget already owns it. When
  // editing, the budget's own category stays selectable so you can keep it;
  // when creating there is no "own" category, so every used one is off-limits.
  const ownKey = editing ? (editing.categoryId ?? '__overall__') : null
  const taken = (key: string) => usedCatKeys.has(key) && key !== ownKey

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setCatId(editing.categoryId)
      setAmount(String(editing.amount))
    } else {
      const firstFree = expenseCats.find((c) => !usedCatKeys.has(c.id))
      setCatId(usedCatKeys.has('__overall__') ? (firstFree?.id ?? null) : null)
      setAmount('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const save = async () => {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    const res = await runWrite(
      () =>
        setBudget({
          id: editing?.id,
          categoryId: catId,
          period: 'monthly',
          amount: amt,
          currency: base,
        }),
      setError,
    )
    if (res.ok) onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit budget' : 'New budget'}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Applies to</p>
          <div className="flex flex-wrap gap-1.5">
            <ChipToggle
              label="💰 Overall"
              on={catId === null}
              disabled={taken('__overall__')}
              onClick={() => setCatId(null)}
            />
            {expenseCats.map((c) => (
              <ChipToggle
                key={c.id}
                label={`${c.icon} ${c.name}`}
                on={catId === c.id}
                disabled={taken(c.id)}
                onClick={() => setCatId(c.id)}
              />
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Monthly limit
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3">
            <span className="text-muted">{currencySymbol(base)}</span>
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

        <div className="flex gap-2">
          {editing && (
            <button
              onClick={async () => {
                const res = await runWrite(() => deleteBudget(editing.id), setError)
                if (!res.ok) return
                onClose()
                onDeleted?.()
              }}
              className="grid w-12 place-items-center rounded-[1.375rem] border border-border text-expense"
              aria-label="Delete budget"
            >
              <TrashIcon size={20} />
            </button>
          )}
          <button
            onClick={save}
            disabled={!(parseFloat(amount) > 0)}
            className="flex-1 rounded-[1.375rem] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-40"
          >
            {editing ? 'Save' : 'Create budget'}
          </button>
        </div>

        {error && <p className="text-center text-sm text-expense">{error}</p>}
      </div>
    </Sheet>
  )
}

function ChipToggle({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string
  on: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium',
        on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted',
        disabled && 'cursor-not-allowed opacity-30',
      )}
    >
      {label}
    </button>
  )
}
