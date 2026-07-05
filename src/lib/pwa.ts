import { registerSW } from 'virtual:pwa-register'

// Register the service worker immediately and re-check for updates hourly
// while the app is open and online.
// Register on the window 'load' event (immediate: false) so registration never
// competes with the initial render. On repeat visits the already-active worker
// serves the app from cache before this code even runs, so launch stays instant
// and fully offline regardless.
const updateSW = registerSW({
  immediate: false,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // Background update check, at most hourly, and only while actually online.
    setInterval(
      () => {
        if (navigator.onLine) registration.update().catch(() => {})
      },
      60 * 60 * 1000,
    )
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

  const check = (async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      regs.map(async (reg) => {
        await reg.update()
        const worker = reg.installing || reg.waiting
        if (!worker) return
        foundNew = true
        await new Promise<void>((resolve) => {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') resolve()
          })
          setTimeout(resolve, 3000)
        })
      }),
    )
  })()

  // Never let a slow or hanging network delay the reload. If offline, update()
  // rejects fast and we reload the cached app immediately; if a new version is
  // found we wait briefly for it to activate, capped by this race.
  await Promise.race([
    check.catch(() => {}),
    new Promise((r) => setTimeout(r, 3500)),
  ])
  await updateSW(true).catch(() => {})
  window.location.reload()
  return foundNew ? 'updated' : 'current'
}
