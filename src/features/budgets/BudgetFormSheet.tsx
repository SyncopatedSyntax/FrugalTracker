import { useEffect, useMemo, useState } from 'react'
import Sheet from '@/components/Sheet'
import { TrashIcon } from '@/components/icons'
import {
  useBudgets,
  useCategoriesByType,
  useEarliestTransactionDate,
  useSettings,
  useTransactionsInRange,
} from '@/hooks'
import { deleteBudget, setBudget } from '@/db/repo'
import type { Budget } from '@/db/types'
import { currencySymbol, formatMoneyWhole } from '@/lib/currency'
import { addMonths, endOfMonth, startOfMonth, toISO } from '@/lib/date'
import { friendlyBudget, spendingSnapshot, type SpendSnapshot } from '@/lib/budgetMath'
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

  // Spending history for the selected scope, to ground the limit in reality:
  // the 6 complete months before this one (the in-progress month always looks
  // artificially low, so it's excluded).
  const now = useMemo(() => new Date(), [])
  const snapTxs = useTransactionsInRange(
    toISO(startOfMonth(addMonths(now, -6))),
    toISO(endOfMonth(addMonths(now, -1))),
  )
  const earliest = useEarliestTransactionDate()
  const snapshot = useMemo(
    () => spendingSnapshot(snapTxs, catId, earliest, now),
    [snapTxs, catId, earliest, now],
  )

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

  const typedAmt = parseFloat(amount)
  const hasAmt = Number.isFinite(typedAmt) && typedAmt > 0
  const scopeColor =
    (catId !== null && expenseCats.find((c) => c.id === catId)?.color) || 'rgb(var(--c-primary))'
  const suggestTypical = snapshot ? friendlyBudget(snapshot.typical) : 0
  const suggestTrim = snapshot ? friendlyBudget(snapshot.typical * 0.9) : 0

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

        {snapshot ? (
          <SnapshotCard snapshot={snapshot} limit={hasAmt ? typedAmt : 0} color={scopeColor} base={base} />
        ) : (
          <p className="text-xs text-muted">
            No past spending here yet — pick a starting limit and adjust as history builds.
          </p>
        )}

        <div>
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

          {snapshot && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SuggestChip
                label="Typical"
                value={suggestTypical}
                base={base}
                onPick={() => setAmount(String(suggestTypical))}
              />
              {suggestTrim !== suggestTypical && (
                <SuggestChip
                  label="Trim 10%"
                  value={suggestTrim}
                  base={base}
                  onPick={() => setAmount(String(suggestTrim))}
                />
              )}
            </div>
          )}

          {snapshot && hasAmt && <RealismLine snapshot={snapshot} limit={typedAmt} />}
        </div>

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

/** Recent-history context for the chosen scope: a mini bar per complete
 * month, a dashed line at the typed limit (bars that cross it turn red —
 * months this budget would not have survived), a trend readout, and the
 * typical/average/high stats the suggestions are anchored to. */
function SnapshotCard({
  snapshot,
  limit,
  color,
  base,
}: {
  snapshot: SpendSnapshot
  /** The typed monthly limit, or 0 when nothing is typed yet. */
  limit: number
  color: string
  base: string
}) {
  const { months, typical, average, max, trend } = snapshot
  // Headroom above the tallest bar (and the limit line) so neither clips.
  const scaleMax = Math.max(max, limit) * 1.08
  return (
    <div className="rounded-xl bg-surface2 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Last {months.length} month{months.length === 1 ? '' : 's'}
        </p>
        {trend !== null && (
          <span
            className={cn(
              'text-[0.6875rem] font-medium',
              Math.abs(trend) < 0.02 ? 'text-muted' : trend > 0 ? 'text-expense' : 'text-income',
            )}
          >
            {Math.abs(trend) < 0.02
              ? 'steady vs prior 3 mo'
              : `${trend > 0 ? '▲' : '▼'} ${Math.round(Math.abs(trend) * 100)}% vs prior 3 mo`}
          </span>
        )}
      </div>

      <div className="relative h-20">
        {limit > 0 && (
          <div
            className="absolute inset-x-0 z-10 border-t border-dashed border-content/50"
            style={{ bottom: `${Math.min(97, (limit / scaleMax) * 100)}%` }}
          />
        )}
        <div className="flex h-full items-end gap-1">
          {months.map((m) => (
            <div
              key={m.key}
              className="flex-1 rounded-t"
              style={{
                height: `${Math.max(m.spent > 0 ? 3 : 1.5, (m.spent / scaleMax) * 100)}%`,
                backgroundColor:
                  limit > 0 && m.spent > limit ? 'rgb(var(--c-expense))' : color,
                opacity: m.spent > 0 ? 1 : 0.25,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        {months.map((m) => (
          <span key={m.key} className="flex-1 text-center text-[0.5625rem] text-muted">
            {m.label}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 text-center">
        <SnapshotStat label="Typical" value={typical} base={base} />
        <SnapshotStat label="Average" value={average} base={base} />
        <SnapshotStat label="High" value={max} base={base} />
      </div>
    </div>
  )
}

function SnapshotStat({ label, value, base }: { label: string; value: number; base: string }) {
  return (
    <div>
      <p className="text-[0.6875rem] text-muted">{label}</p>
      {/* Exact, not compact: $1,450 vs $1,530 both compact to "$1.5K", and
          these are precisely the numbers the user is calibrating against. */}
      <p className="text-sm font-semibold tabular-nums">{formatMoneyWhole(value, base)}</p>
    </div>
  )
}

function SuggestChip({
  label,
  value,
  base,
  onPick,
}: {
  label: string
  value: number
  base: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-content active:scale-95"
    >
      {label} · {formatMoneyWhole(value, base)}
    </button>
  )
}

/** The realism check for the typed limit: how many recent months it would
 * actually have covered, and how it sits against the typical month. */
function RealismLine({ snapshot, limit }: { snapshot: SpendSnapshot; limit: number }) {
  const n = snapshot.months.length
  const covered = snapshot.months.filter((m) => m.spent <= limit).length
  const delta = (limit - snapshot.typical) / snapshot.typical
  const vsTypical =
    Math.abs(delta) < 0.02
      ? 'right at your typical month'
      : `${Math.round(Math.abs(delta) * 100)}% ${delta > 0 ? 'above' : 'below'} typical`
  return (
    <p
      className={cn(
        'mt-2 text-xs',
        covered === n ? 'text-income' : covered === 0 ? 'text-expense' : 'text-muted',
      )}
    >
      Covers {covered} of your last {n} month{n === 1 ? '' : 's'} · {vsTypical}
    </p>
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
