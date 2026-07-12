import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalculatorIcon,
  ChevronRightIcon,
  CoinsIcon,
  DownloadIcon,
  ListIcon,
  PaletteIcon,
  RefreshIcon,
  SparkleIcon,
  TargetIcon,
  UploadIcon,
} from '@/components/icons'
import { Toast, useToast } from '@/components/Toast'
import { useSettings, useTransactionCount } from '@/hooks'
import { APP_VERSION, forceUpdate, formattedBuildDate } from '@/lib/pwa'

const items = [
  { to: '/more/categories', label: 'Categories', desc: 'Add, edit & reorder', Icon: ListIcon },
  { to: '/more/budgets', label: 'Budgets', desc: 'Monthly spending limits', Icon: TargetIcon },
  { to: '/more/currencies', label: 'Currency & rates', desc: 'Base currency & exchange rates', Icon: CoinsIcon },
  { to: '/more/keypad', label: 'Keypad & calculator', desc: 'Calculator style & one-handed reach', Icon: CalculatorIcon },
  { to: '/more/appearance', label: 'Appearance', desc: 'Light, dark or system', Icon: PaletteIcon },
  { to: '/more/import', label: 'Import from Spendee', desc: 'Bring in a CSV export', Icon: UploadIcon },
  { to: '/more/data', label: 'Backup & export', desc: 'Save or restore your data', Icon: DownloadIcon },
  { to: '/more/demo', label: 'Demo mode', desc: 'Explore with sample data', Icon: SparkleIcon },
]

export default function MoreScreen() {
  const settings = useSettings()
  const count = useTransactionCount() ?? 0
  const { message, show } = useToast()
  const [updating, setUpdating] = useState(false)

  const handleUpdate = async () => {
    setUpdating(true)
    show('Checking for updates…')
    // forceUpdate reloads the page when done, so `updating` stays on until then.
    await forceUpdate()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="safe-top min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        <div className="rounded-[1.375rem] bg-surface p-4">
          <p className="text-2xl font-bold">FrugalTracker</p>
          <p className="mt-1 text-sm text-muted">
            {count} {count === 1 ? 'transaction' : 'transactions'} · base currency {settings.baseCurrency}
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.375rem] bg-surface">
          {items.map(({ to, label, desc, Icon }, i) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-4 py-3.5 active:bg-surface2"
              style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-muted">{desc}</span>
              </span>
              <ChevronRightIcon size={18} className="text-muted" />
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-[1.375rem] bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Version {APP_VERSION}</p>
              <p className="truncate text-xs text-muted">Updated {formattedBuildDate()}</p>
            </div>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-primary px-3.5 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              <RefreshIcon size={16} className={updating ? 'animate-spin' : ''} />
              {updating ? 'Updating…' : 'Update'}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Works offline · all data stays private on this device.
        </p>
      </div>

      <Toast message={message} />
    </div>
  )
}
