import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches any render/lifecycle exception in the app tree and shows a
 * recoverable fallback instead of unmounting to a blank white screen. Only
 * covers render-time errors — event-handler and async write failures are
 * handled separately via `lib/write.ts`'s `runWrite`. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No remote logging (the app is local-only); a console trace is the most
    // a serverless PWA can do, and helps when a user shares a screen recording.
    console.error('App crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-5xl">😵</p>
        <div>
          <h1 className="text-lg font-bold text-content">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted">
            The app hit an unexpected error. Your data is stored on this device and is safe.
          </p>
        </div>
        <pre className="max-h-32 w-full max-w-sm overflow-auto rounded-xl bg-surface p-3 text-left text-[0.6875rem] leading-relaxed text-muted">
          {error.message || String(error)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-[1.375rem] bg-primary px-6 py-3 text-base font-semibold text-primary-fg active:scale-[0.98]"
        >
          Reload app
        </button>
      </div>
    )
  }
}
