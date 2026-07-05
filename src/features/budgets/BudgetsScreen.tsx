import { useEffect, useMemo, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { PlusIcon, TrashIcon } from '@/components/icons'
import {
  useBudgets,
  useCategoriesByType,
  useCategoryMap,
  useRateMap,
  useSettings,
  useTransactionsInRange,
} from '@/hooks'
import { deleteBudget, setBudget } from '@/db/repo'
import type { Budget } from '@/db/types'
import { toBase } from '@/lib/convert'
import { currencySymbol, formatMoney } from '@/lib/currency'
import { endOfMonth, monthLabel, startOfMonth, toISO } from '@/lib/date'
import { cn } from '@/lib/cn'

export default function BudgetsScreen() {
  const settings = useSettings()
  const base = settings.baseCurrency
  const budgets = useBudgets()
  const categoryMap = useCategoryMap()
  const expenseCats = useCategoriesByType('expense')
  const rates = useRateMap()

  const now = new Date()
  const monthTxs = useTransactionsInRange(toISO(startOfMonth(now)), toISO(endOfMonth(now)))

  const { spentByCat, totalSpent } = useMemo(() => {
    const map = new Map<string, number>()
    let total = 0
    for (const t of monthTxs) {
      if (t.type !== 'expense') continue
      const v = toBase(t.amount, t.currency, rates)
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + v)
      total += v
    }
    return { spentByCat: map, totalSpent: total }
  }, [monthTxs, rates])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | undefined>()
  const [catId, setCatId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')

  const usedCatKeys = new Set(budgets.map((b) => b.categoryId ?? '__overall__'))

  useEffect(() => {
    if (!open) return
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
    await setBudget({
      id: editing?.id,
      categoryId: catId,
      period: 'monthly',
      amount: amt,
      currency: base,
    })
    setOpen(false)
  }

  const sorted = useMemo(
    () => [...budgets].sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : 0)),
    [budgets],
  )

  return (
    <SubScreen
      title="Budgets"
      right={
        <button
          onClick={() => {
            setEditing(undefined)
            setOpen(true)
          }}
          className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10"
          aria-label="Add budget"
        >
          <PlusIcon size={22} />
        </button>
      }
    >
      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-muted">{monthLabel(now)} · limits in {base}</p>

        {sorted.length === 0 ? (
          <div className="rounded-[22px] bg-surface p-8 text-center">
            <p className="text-4xl">🎯</p>
            <p className="mt-3 text-sm text-muted">
              No budgets yet. Tap + to set a monthly spending limit.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((b) => {
              const cat = b.categoryId ? categoryMap.get(b.categoryId) : undefined
              const spent = b.categoryId ? (spentByCat.get(b.categoryId) ?? 0) : totalSpent
              const ratio = b.amount > 0 ? spent / b.amount : 0
              const over = ratio > 1
              const near = ratio >= 0.8 && !over
              const barColor = over ? 'rgb(var(--c-expense))' : near ? '#D1A54E' : (cat?.color ?? 'rgb(var(--c-primary))')
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setEditing(b)
                    setOpen(true)
                  }}
                  className="block w-full rounded-[22px] bg-surface p-4 text-left"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-base"
                      style={{ backgroundColor: (cat?.color ?? '#64748b') + '22' }}
                    >
                      {cat ? cat.icon : '💰'}
                    </span>
                    <span className="flex-1 text-sm font-semibold">
                      {cat ? cat.name : 'Overall'}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        over ? 'text-expense' : 'text-content',
                      )}
                    >
                      {formatMoney(spent, base)}{' '}
                      <span className="font-normal text-muted">/ {formatMoney(b.amount, base)}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <p className={cn('mt-1.5 text-xs', over ? 'text-expense' : 'text-muted')}>
                    {over
                      ? `${formatMoney(spent - b.amount, base)} over budget`
                      : `${formatMoney(b.amount - spent, base)} left`}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit budget' : 'New budget'}
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Applies to
            </p>
            <div className="flex flex-wrap gap-1.5">
              <ChipToggle
                label="💰 Overall"
                on={catId === null}
                disabled={!editing && usedCatKeys.has('__overall__')}
                onClick={() => setCatId(null)}
              />
              {expenseCats.map((c) => (
                <ChipToggle
                  key={c.id}
                  label={`${c.icon} ${c.name}`}
                  on={catId === c.id}
                  disabled={!editing && usedCatKeys.has(c.id)}
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
                  await deleteBudget(editing.id)
                  setOpen(false)
                }}
                className="grid w-12 place-items-center rounded-[22px] border border-border text-expense"
                aria-label="Delete budget"
              >
                <TrashIcon size={20} />
              </button>
            )}
            <button
              onClick={save}
              disabled={!(parseFloat(amount) > 0)}
              className="flex-1 rounded-[22px] bg-primary py-3 text-base font-semibold text-primary-fg disabled:opacity-40"
            >
              {editing ? 'Save' : 'Create budget'}
            </button>
          </div>
        </div>
      </Sheet>
    </SubScreen>
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
