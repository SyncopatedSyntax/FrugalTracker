import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SubScreen from '@/components/SubScreen'
import CurrencyPickerSheet from '@/components/CurrencyPickerSheet'
import { UploadIcon } from '@/components/icons'
import { useSettings } from '@/hooks'
import { changeBaseCurrency } from '@/db/repo'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/currency'
import {
  autoMap,
  buildPreview,
  FIELD_LABELS,
  parseCsv,
  runImport,
  type FieldKey,
  type ImportResult,
  type Mapping,
  type ParsedCsv,
} from '@/lib/spendeeImport'

const FIELD_ORDER: FieldKey[] = ['date', 'amount', 'type', 'category', 'currency', 'note', 'labels']

export default function ImportScreen() {
  const settings = useSettings()
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [defaultCurrency, setDefaultCurrency] = useState(settings.baseCurrency)
  const [dedupe, setDedupe] = useState(true)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setAsBase, setSetAsBase] = useState(true)
  const [baseChanged, setBaseChanged] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('Could not find any rows in that file.')
        return
      }
      setCsv(parsed)
      setMapping(autoMap(parsed.headers))
    } catch {
      setError('Could not read that file.')
    }
  }

  const preview = useMemo(
    () => (csv && mapping ? buildPreview(csv.rows, mapping, defaultCurrency) : []),
    [csv, mapping, defaultCurrency],
  )
  const validCount = preview.filter((r) => r.valid).length
  const invalidCount = preview.length - validCount

  // If every valid row shares one currency that isn't the current base, offer
  // to adopt it so totals read correctly without manual setup.
  const detectedCurrency = useMemo(() => {
    const set = new Set(preview.filter((r) => r.valid).map((r) => r.currency))
    return set.size === 1 ? [...set][0] : null
  }, [preview])
  const offerBase = !!detectedCurrency && detectedCurrency !== settings.baseCurrency

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await runImport(preview, dedupe)
      if (offerBase && setAsBase && detectedCurrency) {
        await changeBaseCurrency(detectedCurrency)
        setBaseChanged(detectedCurrency)
      }
      setResult(res)
    } catch (e) {
      setError('Import failed: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------- Result view ------------------------------ */
  if (result) {
    return (
      <SubScreen title="Import complete">
        <div className="px-4 py-8 text-center">
          <p className="text-5xl">🎉</p>
          <p className="mt-4 text-lg font-semibold">Imported {result.imported} transactions</p>
          <div className="mx-auto mt-4 max-w-xs space-y-1 text-sm text-muted">
            {result.categoriesCreated > 0 && (
              <p>{result.categoriesCreated} new categories created</p>
            )}
            {result.skipped > 0 && <p>{result.skipped} duplicates skipped</p>}
            {result.invalid > 0 && <p>{result.invalid} rows skipped (unreadable)</p>}
            {baseChanged && <p>Base currency set to {baseChanged}</p>}
          </div>
          <Link
            to="/transactions"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-fg"
          >
            View transactions
          </Link>
        </div>
      </SubScreen>
    )
  }

  /* -------------------------------- Choose file ----------------------------- */
  if (!csv || !mapping) {
    return (
      <SubScreen title="Import from Spendee">
        <div className="px-4 py-6">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-border bg-surface p-10 text-center">
            <UploadIcon size={36} className="text-primary" />
            <span className="text-sm font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted">Export your data from Spendee as CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
              }}
            />
          </label>
          {error && <p className="mt-4 text-center text-sm text-expense">{error}</p>}
          <div className="mt-6 rounded-[22px] bg-surface p-4 text-sm text-muted">
            <p className="mb-1 font-semibold text-content">How it works</p>
            <p>
              Pick your exported CSV. We’ll auto-detect the columns and show a preview so you can
              check everything before importing. Missing categories are created automatically.
            </p>
          </div>
        </div>
      </SubScreen>
    )
  }

  /* ------------------------------- Map & preview ---------------------------- */
  return (
    <SubScreen title="Review import">
      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-muted">
          Found <span className="font-semibold text-content">{csv.rows.length}</span> rows. Match
          each field to a column, then check the preview.
        </p>

        {/* Column mapping */}
        <div className="space-y-2 rounded-[22px] bg-surface p-3">
          {FIELD_ORDER.map((field) => (
            <div key={field} className="flex items-center gap-3">
              <span className="w-28 flex-shrink-0 text-sm font-medium">{FIELD_LABELS[field]}</span>
              <select
                value={mapping[field] ?? ''}
                onChange={(e) =>
                  setMapping({ ...mapping, [field]: e.target.value || null })
                }
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">— none —</option>
                {csv.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Options */}
        <div className="mt-3 space-y-2 rounded-[22px] bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Fallback currency</span>
            <button
              onClick={() => setCurrencyOpen(true)}
              className="rounded-full bg-surface2 px-3 py-1.5 text-sm font-semibold"
            >
              {defaultCurrency}
            </button>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">Skip duplicates</span>
            <input
              type="checkbox"
              checked={dedupe}
              onChange={(e) => setDedupe(e.target.checked)}
              className="h-5 w-5 accent-[rgb(var(--c-primary))]"
            />
          </label>
          {offerBase && (
            <label className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
              <span className="min-w-0 text-sm">
                Set base currency to {detectedCurrency}
                <span className="block text-xs text-muted">
                  Every entry is in {detectedCurrency}, so totals will read correctly
                </span>
              </span>
              <input
                type="checkbox"
                checked={setAsBase}
                onChange={(e) => setSetAsBase(e.target.checked)}
                className="h-5 w-5 flex-shrink-0 accent-[rgb(var(--c-primary))]"
              />
            </label>
          )}
        </div>

        {/* Summary */}
        <div className="mt-3 flex gap-2 text-sm">
          <span className="rounded-full bg-income/15 px-3 py-1 font-medium text-income">
            {validCount} ready
          </span>
          {invalidCount > 0 && (
            <span className="rounded-full bg-expense/15 px-3 py-1 font-medium text-expense">
              {invalidCount} unreadable
            </span>
          )}
        </div>

        {/* Preview */}
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Preview {preview.length > 40 ? '(first 40 rows)' : ''}
        </p>
        <div className="overflow-x-auto rounded-[22px] border border-border">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface2 text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Note</th>
                <th className="px-2 py-2 font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 40).map((r, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-t border-border/60',
                    !r.valid && 'bg-expense/10 text-expense',
                  )}
                >
                  <td className="whitespace-nowrap px-2 py-1.5">{r.valid ? r.date : r.error}</td>
                  <td className="px-2 py-1.5">
                    <span className={r.type === 'expense' ? 'text-expense' : 'text-income'}>
                      {r.type === 'expense' ? 'Exp' : 'Inc'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatMoney(r.amount, r.currency)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{r.categoryName}</td>
                  <td className="max-w-[8rem] truncate px-2 py-1.5">{r.note}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                    {r.tags.map((t) => '#' + t).join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="mt-3 text-sm text-expense">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => {
              setCsv(null)
              setMapping(null)
            }}
            className="rounded-[22px] border border-border px-4 py-3 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
          <button
            onClick={doImport}
            disabled={busy || validCount === 0 || !mapping.date || !mapping.amount}
            className="flex-1 rounded-[22px] bg-primary py-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
          >
            {busy ? 'Importing…' : `Import ${validCount} transactions`}
          </button>
        </div>
      </div>

      <CurrencyPickerSheet
        open={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        value={defaultCurrency}
        onSelect={setDefaultCurrency}
      />
    </SubScreen>
  )
}
