import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeWriteError, runWrite } from './write'

// runWrite logs to console.error on failure by design; silence it so the
// intentional-failure cases don't spam the test output.
afterEach(() => vi.restoreAllMocks())

describe('describeWriteError', () => {
  it('calls out the actionable quota case by error name', () => {
    const err = new Error('boom')
    err.name = 'QuotaExceededError'
    expect(describeWriteError(err)).toMatch(/storage looks full/i)
  })

  it('calls out the quota case when only the message mentions quota', () => {
    expect(describeWriteError(new Error('The quota has been exceeded'))).toMatch(
      /storage looks full/i,
    )
  })

  it('falls back to a generic message for anything else', () => {
    const msg = describeWriteError(new Error('some other failure'))
    expect(msg).toMatch(/please try again/i)
    expect(msg).not.toMatch(/storage/i)
  })

  it('handles non-Error throwables', () => {
    expect(describeWriteError('just a string')).toMatch(/please try again/i)
    expect(describeWriteError(undefined)).toMatch(/please try again/i)
  })
})

describe('runWrite', () => {
  it('returns the value and does not call onError on success', async () => {
    const onError = vi.fn()
    const res = await runWrite(async () => 42, onError)
    expect(res).toEqual({ ok: true, value: 42 })
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports failure via onError and returns { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const res = await runWrite(async () => {
      const err = new Error('nope')
      err.name = 'QuotaExceededError'
      throw err
    }, onError)
    expect(res).toEqual({ ok: false })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/storage looks full/i))
  })
})
