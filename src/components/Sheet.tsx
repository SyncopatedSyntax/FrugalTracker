import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { XIcon } from './icons'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Extra classes for the panel (e.g. height). */
  className?: string
}

export default function Sheet({ open, onClose, title, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 mx-auto flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-sheet animate-slide-up safe-bottom',
          className,
        )}
      >
        <div className="flex items-center px-4 pt-3 pb-1">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-border" />
        </div>
        {title !== undefined && (
          <div className="flex items-center justify-between px-4 pb-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface2"
              aria-label="Close"
            >
              <XIcon size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}
