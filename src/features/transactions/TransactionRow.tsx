import type { Category, Transaction } from '@/db/types'
import { formatMoney } from '@/lib/currency'
import { cn } from '@/lib/cn'

interface Props {
  tx: Transaction
  category?: Category
  base: string
  onClick?: () => void
}

export default function TransactionRow({ tx, category, base, onClick }: Props) {
  const isExpense = tx.type === 'expense'
  const sign = isExpense ? '-' : '+'
  const showConverted = tx.currency !== base

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface2"
    >
      <span
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-lg"
        style={{ backgroundColor: (category?.color ?? '#64748b') + 'CC' }}
      >
        {category?.icon ?? '❓'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-content">
          {category?.name ?? 'Uncategorized'}
        </span>
        {(tx.note || tx.tags.length > 0) && (
          <span className="block truncate text-xs text-muted">
            {tx.note}
            {tx.note && tx.tags.length > 0 ? ' · ' : ''}
            {tx.tags.map((t) => '#' + t).join(' ')}
          </span>
        )}
      </span>
      <span className="flex-shrink-0 text-right">
        <span
          className={cn(
            'block text-sm font-semibold tabular-nums',
            isExpense ? 'text-expense' : 'text-income',
          )}
        >
          {sign}
          {formatMoney(tx.amount, tx.currency)}
        </span>
        {showConverted && (
          <span className="block text-[0.6875rem] text-muted tabular-nums">
            {sign}
            {formatMoney(tx.baseAmount, base)}
          </span>
        )}
      </span>
    </button>
  )
}
