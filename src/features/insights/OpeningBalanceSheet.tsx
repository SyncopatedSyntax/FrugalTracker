import { useEffect, useState } from 'react'
import Sheet from '@/components/Sheet'
import { updateSettings } from '@/db/repo'
import { currencySymbol } from '@/lib/currency'
import { todayISO } from '@/lib/date'

interface Props {
  open: boolean
  onClose: () => void
  baseCurrency: string
  openingBalance: number
  openingBalanceDate: string
  earliestDate: string
}

export default function OpeningBalanceSheet({
  open,
  onClose,
  baseCurrency,
  openingBalance,
  openingBalanceDate,
  earliestDate,
}: Props) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount(openingBalance ? String(openingBalance) : '')
    setDate(openingBalanceDate || earliestDate || todayISO())
  }, [open, openingBalance, openingBalanceDate, earliestDate])

  const save = async () => {
    const amt = parseFloat(amount)
    await updateSettings({
      openingBalance: Number.isFinite(amt) ? amt : 0,
      openingBalanceDate: date || '',
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Opening balance">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Your total balance at the start of tracking. Net worth is this plus every income and
          expense recorded after the date below.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Balance ({baseCurrency})
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3">
            <span className="text-muted">{currencySymbol(baseCurrency)}</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent py-3 text-base outline-none"
              autoFocus
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            As of date
          </span>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={save}
          className="w-full rounded-[1.375rem] bg-primary py-3.5 text-base font-semibold text-primary-fg"
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}
