import { Link } from 'react-router-dom'
import {
  ChevronRightIcon,
  CoinsIcon,
  DownloadIcon,
  ListIcon,
  PaletteIcon,
  TargetIcon,
  UploadIcon,
} from '@/components/icons'
import { useSettings, useTransactionCount } from '@/hooks'

const items = [
  { to: '/more/categories', label: 'Categories', desc: 'Add, edit & reorder', Icon: ListIcon },
  { to: '/more/budgets', label: 'Budgets', desc: 'Monthly spending limits', Icon: TargetIcon },
  { to: '/more/currencies', label: 'Currency & rates', desc: 'Base currency & exchange rates', Icon: CoinsIcon },
  { to: '/more/appearance', label: 'Appearance', desc: 'Light, dark or system', Icon: PaletteIcon },
  { to: '/more/import', label: 'Import from Spendee', desc: 'Bring in a CSV export', Icon: UploadIcon },
  { to: '/more/data', label: 'Backup & export', desc: 'Save or restore your data', Icon: DownloadIcon },
]

export default function MoreScreen() {
  const settings = useSettings()
  const count = useTransactionCount() ?? 0

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top border-b border-border bg-surface/95 px-4 pt-2 pb-3 backdrop-blur">
        <h1 className="text-xl font-bold">More</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 rounded-2xl bg-surface p-4">
          <p className="text-2xl font-bold">FrugalTracker</p>
          <p className="mt-1 text-sm text-muted">
            {count} {count === 1 ? 'transaction' : 'transactions'} · base currency {settings.baseCurrency}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface">
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

        <p className="mt-6 text-center text-xs text-muted">
          All data is stored privately on this device.
        </p>
      </div>
    </div>
  )
}
