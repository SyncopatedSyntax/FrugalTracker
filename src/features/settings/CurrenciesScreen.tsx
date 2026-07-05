import { useEffect, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import { Toast, useToast } from '@/components/Toast'
import { ChevronRightIcon, PlusIcon, RefreshIcon, TrashIcon } from '@/components/icons'
import { useRates, useSettings } from '@/hooks'
import { changeBaseCurrency, deleteRate, setRate } from '@/db/repo'
import { currencyInfo } from '@/lib/currency'
import { cn } from '@/lib/cn'

export default function CurrenciesScreen() {
  const settings = useSettings()
  const base = settings.baseCurrency
  const rates = useRates()
  const { message, show } = useToast()

  const [baseOpen, setBaseOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editCurrency, setEditCurrency] = useState<string | null>(null)
  const [rateText, setRateText] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const others = rates
    .filter((r) => r.currency !== base)
    .sort((a, b) => a.currency.localeCompare(b.currency))

  useEffect(() => {
    if (editCurrency) {
      const r = rates.find((x) => x.currency === editCurrency)
      setRateText(r ? String(r.rate) : '1')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCurrency])

  const saveRate = async () => {
    if (!editCurrency) return
    const v = parseFloat(rateText)
    if (Number.isFinite(v) && v > 0) await setRate(editCurrency, v)
    setEditCurrency(null)
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
      const data = await res.json()
      if (data.result !== 'success' || !data.rates) throw new Error('bad response')
      let updated = 0
      for (const r of others) {
        const perBase = data.rates[r.currency]
        if (perBase && perBase > 0) {
          await setRate(r.currency, 1 / perBase)
          updated++
        }
      }
      show(updated ? `Updated ${updated} rate${updated === 1 ? '' : 's'}` : 'No rates to update')
    } catch {
      show('Could not fetch rates (offline?)')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <SubScreen title="Currency & rates">
      <div className="px-4 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Base currency
        </p>
        <button
          onClick={() => setBaseOpen(true)}
          className="mb-6 flex w-full items-center gap-3 rounded-2xl bg-surface p-4"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
            {currencyInfo(base).symbol}
          </span>
          <span className="flex-1 text-left">
            <span className="block text-sm font-semibold">{base}</span>
            <span className="block text-xs text-muted">{currencyInfo(base).name}</span>
          </span>
          <ChevronRightIcon size={18} className="text-muted" />
        </button>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Exchange rates
          </p>
          <button
            onClick={refresh}
            disabled={refreshing || others.length === 0}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-primary disabled:opacity-40"
          >
            <RefreshIcon size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Updating…' : 'Update online'}
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface">
          {others.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Add currencies you spend in to convert them into {base}.
            </p>
          )}
          {others.map((r, i) => (
            <button
              key={r.currency}
              onClick={() => setEditCurrency(r.currency)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface2"
              style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-sm font-semibold">
                {currencyInfo(r.currency).symbol}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{r.currency}</span>
                <span className="block text-xs text-muted">
                  1 {r.currency} = {r.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                  {base}
                </span>
              </span>
              <ChevronRightIcon size={18} className="text-muted" />
            </button>
          ))}
        </div>

        <button
          onClick={() => setAddOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted"
        >
          <PlusIcon size={18} /> Add currency
        </button>

        <p className="mt-4 text-xs text-muted">
          Rates are used to convert entries into your base currency for totals and insights.
          Update them manually or fetch the latest when you’re online.
        </p>
      </div>

      <Toast message={message} />

      <CurrencyPickerSheet
        open={baseOpen}
        onClose={() => setBaseOpen(false)}
        value={base}
        onSelect={(code) => changeBaseCurrency(code)}
      />

      <CurrencyPickerSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        value=""
        onSelect={async (code) => {
          if (code === base) return
          if (!rates.some((r) => r.currency === code)) await setRate(code, 1)
          setEditCurrency(code)
        }}
      />

      <Sheet
        open={!!editCurrency}
        onClose={() => setEditCurrency(null)}
        title={editCurrency ? `${editCurrency} rate` : ''}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
              1 {editCurrency} equals (in {base})
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-3 text-base outline-none focus:border-primary"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (editCurrency) await deleteRate(editCurrency)
                setEditCurrency(null)
              }}
              className={cn(
                'grid w-12 place-items-center rounded-2xl border border-border text-expense',
              )}
              aria-label="Remove currency"
            >
              <TrashIcon size={20} />
            </button>
            <button
              onClick={saveRate}
              className="flex-1 rounded-2xl bg-primary py-3 text-base font-semibold text-primary-fg"
            >
              Save rate
            </button>
          </div>
        </div>
      </Sheet>
    </SubScreen>
  )
}
