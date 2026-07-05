import { useCallback, useRef, useState } from 'react'

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-4">
      <div className="animate-pop rounded-full bg-content px-4 py-2 text-sm font-medium text-bg shadow-lg">
        {message}
      </div>
    </div>
  )
}

export function useToast(duration = 1600) {
  const [message, setMessage] = useState<string | null>(null)
  const ref = useRef<number>()
  const show = useCallback(
    (m: string) => {
      setMessage(m)
      window.clearTimeout(ref.current)
      ref.current = window.setTimeout(() => setMessage(null), duration)
    },
    [duration],
  )
  return { message, show }
}
