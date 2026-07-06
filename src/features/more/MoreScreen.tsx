import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRightIcon,
  CoinsIcon,
  DownloadIcon,
  ListIcon,
  PaletteIcon,
  RefreshIcon,
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
  { to: '/more/appearance', label: 'Appearance', desc: 'Light, dark or system', Icon: PaletteIcon },
  { to: '/more/import', label: 'Import from Spendee', desc: 'Bring in a CSV export', Icon: UploadIcon },
  { to: '/more/data', label: 'Backup & export', desc: 'Save or restore your data', Icon: DownloadIcon },
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
      <header className="safe-top border-b border-border bg-surface/95 px-4 pt-2 pb-3 backdrop-blur">
        <h1 className="text-xl font-bold">More</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 rounded-[22px] bg-surface p-4">
          <p className="text-2xl font-bold">FrugalTracker</p>
          <p className="mt-1 text-sm text-muted">
            {count} {count === 1 ? 'transaction' : 'transactions'} · base currency {settings.baseCurrency}
          </p>
        </div>

        <div className="overflow-hidden rounded-[22px] bg-surface">
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

        <div className="mt-6 rounded-[22px] bg-surface p-4">
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

        <DisplayMetrics />

        <p className="mt-4 text-center text-xs text-muted">
          Works offline · all data stays private on this device.
        </p>
      </div>

      <Toast message={message} />
    </div>
  )
}

/** TEMPORARY debug readout to diagnose the iOS standalone bottom-gap: prints
 *  the raw viewport/screen/safe-area numbers iOS actually reports. Remove once
 *  the gap is understood. */
function measureEnv(prop: string): number {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:0;bottom:0;width:0;height:env(${prop});visibility:hidden;pointer-events:none;`
  document.body.appendChild(el)
  const h = Math.round(el.getBoundingClientRect().height)
  el.remove()
  return h
}

function readMetrics() {
  const root = document.getElementById('root')
  return {
    screen: `${window.screen.width}×${window.screen.height}`,
    inner: `${window.innerWidth}×${window.innerHeight}`,
    visual: window.visualViewport
      ? `${Math.round(window.visualViewport.width)}×${Math.round(window.visualViewport.height)}`
      : 'n/a',
    docClientH: document.documentElement.clientHeight,
    rootRectH: root ? Math.round(root.getBoundingClientRect().height) : 0,
    rootBottom: root ? Math.round(root.getBoundingClientRect().bottom) : 0,
    sat: measureEnv('safe-area-inset-top'),
    sab: measureEnv('safe-area-inset-bottom'),
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS legacy flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    dpr: window.devicePixelRatio,
  }
}

function DisplayMetrics() {
  const [m, setM] = useState(readMetrics)
  useEffect(() => {
    const on = () => setM(readMetrics())
    // Re-measure after layout settles and on any viewport change.
    const t = setTimeout(on, 300)
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    window.visualViewport?.addEventListener('resize', on)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
      window.visualViewport?.removeEventListener('resize', on)
    }
  }, [])
  const rows: [string, string | number | boolean][] = [
    ['screen (pt)', m.screen],
    ['innerW×H', m.inner],
    ['visualViewport', m.visual],
    ['doc.clientHeight', m.docClientH],
    ['#root rect H', m.rootRectH],
    ['#root rect bottom', m.rootBottom],
    ['safe-top', m.sat],
    ['safe-bottom', m.sab],
    ['standalone', m.standalone],
    ['dpr', m.dpr],
  ]
  return (
    <div className="mt-4 rounded-[22px] bg-surface p-4">
      <p className="mb-2 text-sm font-semibold">Display metrics (debug)</p>
      <div className="space-y-1 font-mono text-xs text-muted">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <span>{k}</span>
            <span className="text-content">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
