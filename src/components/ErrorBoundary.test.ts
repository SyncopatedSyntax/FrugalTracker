import { describe, expect, it } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

// The rendered fallback is exercised end-to-end (a bad record is injected and
// Activity is loaded to confirm the recovery screen appears instead of a blank
// white screen). Here we just pin the pure state-derivation contract, which is
// what turns a thrown render error into the fallback in the first place.
describe('ErrorBoundary.getDerivedStateFromError', () => {
  it('captures the thrown error into state so render() shows the fallback', () => {
    const err = new Error('render blew up')
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err })
  })
})
