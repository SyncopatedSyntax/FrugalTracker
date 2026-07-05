import { registerSW } from 'virtual:pwa-register'

// Register the service worker immediately and re-check for updates hourly
// while the app is open and online.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
    }
  },
})

export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

export function formattedBuildDate(): string {
  try {
    return new Date(BUILD_TIME).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return BUILD_TIME
  }
}

export type UpdateOutcome = 'updated' | 'current' | 'unsupported'

/**
 * Force a check for a newer deployed version. If one is found it activates and
 * the page reloads with fresh assets. Works offline-safe (just reloads current).
 */
export async function forceUpdate(): Promise<UpdateOutcome> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    window.location.reload()
    return 'unsupported'
  }
  let foundNew = false
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      regs.map(
        (reg) =>
          new Promise<void>((resolve) => {
            reg
              .update()
              .then(() => {
                const worker = reg.installing || reg.waiting
                if (!worker) return resolve()
                foundNew = true
                worker.addEventListener('statechange', () => {
                  if (worker.state === 'activated') resolve()
                })
                // Fallback so we never hang waiting on activation.
                setTimeout(resolve, 4000)
              })
              .catch(() => resolve())
          }),
      ),
    )
  } catch {
    /* offline or blocked — fall through to a plain reload */
  }
  // Apply any waiting worker, then reload with the freshest assets.
  await updateSW(true).catch(() => {})
  window.location.reload()
  return foundNew ? 'updated' : 'current'
}
