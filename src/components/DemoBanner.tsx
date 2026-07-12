import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exitDemoMode } from '@/db/demoMode'
import { useDemoMode } from '@/hooks'
import { SparkleIcon } from './icons'

/** Persistent reminder shown on every screen while Demo Mode is active, with
 * a one-tap way out from anywhere — so it's never ambiguous you're looking
 * at sample data, and never a hunt to get back to your own. */
export default function DemoBanner() {
  const isDemo = useDemoMode()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  if (!isDemo) return null

  const onExit = async () => {
    setBusy(true)
    await exitDemoMode()
    setBusy(false)
    navigate('/insights')
  }

  return (
    <div className="safe-top flex-shrink-0 border-b border-primary/30 bg-primary/15">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <SparkleIcon size={14} />
          Demo mode — viewing sample data
        </span>
        <button
          onClick={onExit}
          disabled={busy}
          className="flex-shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-fg disabled:opacity-60"
        >
          {busy ? 'Exiting…' : 'Exit demo'}
        </button>
      </div>
    </div>
  )
}
