import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import { SparkleIcon } from '@/components/icons'
import { enterDemoMode, exitDemoMode } from '@/db/demoMode'
import { useDemoMode } from '@/hooks'

export default function DemoScreen() {
  const isDemo = useDemoMode()
  const navigate = useNavigate()
  const { message, show } = useToast()
  const [confirmOn, setConfirmOn] = useState(false)
  const [busy, setBusy] = useState(false)

  const doEnter = async () => {
    setConfirmOn(false)
    setBusy(true)
    await enterDemoMode()
    setBusy(false)
    show('Now viewing sample data')
    navigate('/insights')
  }

  const doExit = async () => {
    setBusy(true)
    await exitDemoMode()
    setBusy(false)
    show('Your data is back')
    navigate('/insights')
  }

  return (
    <SubScreen title="Demo mode">
      <div className="px-4 py-4">
        <div className="mb-4 rounded-[22px] bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <SparkleIcon size={20} />
            <p className="text-sm font-semibold">Explore with sample data</p>
          </div>
          <p className="text-sm text-muted">
            Switches the whole app to a built-in sample dataset — about two years of transactions,
            categories, budgets, and a couple of currencies — so you can try every feature without
            touching your own data. Your appearance settings stay exactly as you have them.
          </p>
          <p className="mt-2 text-sm text-muted">
            Your current data is safely set aside and comes back exactly as it is now, the moment you
            turn this off. Anything you do while exploring the sample data won't be kept.
          </p>
        </div>

        <div className="overflow-hidden rounded-[22px] bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Demo mode</span>
              <span className="block truncate text-xs text-muted">
                {isDemo ? 'Currently on — viewing sample data' : 'Currently off'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={isDemo}
              disabled={busy}
              onChange={(e) => (e.target.checked ? setConfirmOn(true) : void doExit())}
              className="h-6 w-6 flex-shrink-0 accent-[rgb(var(--c-primary))] disabled:opacity-60"
              aria-label="Demo mode"
            />
          </div>
        </div>
      </div>

      <Toast message={message} />

      <Sheet open={confirmOn} onClose={() => setConfirmOn(false)} title="Switch to demo data?">
        <p className="text-sm text-muted">
          This temporarily replaces your transactions, categories, and budgets with a sample dataset.
          Nothing is deleted — your own data comes back exactly as it is now the moment you turn this
          off.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmOn(false)}
            className="flex-1 rounded-[22px] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={doEnter}
            className="flex-1 rounded-[22px] bg-primary py-3 text-sm font-semibold text-primary-fg"
          >
            Enable
          </button>
        </div>
      </Sheet>
    </SubScreen>
  )
}
