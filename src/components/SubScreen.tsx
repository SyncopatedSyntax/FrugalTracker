import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from './icons'

interface SubScreenProps {
  title: string
  right?: ReactNode
  children: ReactNode
  /** Fallback path when there's no history to go back to. */
  backTo?: string
}

export default function SubScreen({ title, right, children, backTo }: SubScreenProps) {
  const navigate = useNavigate()
  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(backTo ?? '/more')
  }
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col bg-bg">
      <header className="safe-top sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface/95 px-2 py-2 backdrop-blur">
        <button
          onClick={goBack}
          className="grid h-10 w-10 place-items-center rounded-full text-content hover:bg-surface2"
          aria-label="Back"
        >
          <ArrowLeftIcon size={22} />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
        {right && <div className="flex items-center gap-1 pr-1">{right}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
