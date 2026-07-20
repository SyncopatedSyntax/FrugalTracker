/** Human-friendly message for a failed IndexedDB write. Calls out the
 * realistic quota/eviction case (device or private-mode storage full)
 * distinctly from a generic failure, since that's the one a user can act on. */
export function describeWriteError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  if (name === 'QuotaExceededError' || /quota/i.test(String(err))) {
    return 'Couldn’t save — device storage looks full. Free up space and try again.'
  }
  return 'Couldn’t save — please try again.'
}

/** Run a data write, surfacing a toast (and a console error) if it throws
 * instead of letting it fail silently — an IndexedDB write can reject on
 * quota/eviction (notably on iOS), private-mode storage limits, or a full
 * disk, and for a money tracker a vanished entry with no feedback is the
 * worst outcome. Returns the write's result on success, or `{ ok: false }`
 * so the caller can bail (skip its success toast / state reset) on failure. */
export async function runWrite<T>(
  fn: () => Promise<T>,
  onError: (msg: string) => void,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    console.error('Write failed:', err)
    onError(describeWriteError(err))
    return { ok: false }
  }
}
