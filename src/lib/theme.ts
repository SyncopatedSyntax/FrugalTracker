import type { ThemePref } from '@/db/types'

const KEY = 'ft-theme'

export function applyTheme(pref: ThemePref): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = pref === 'dark' || (pref === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  try {
    // index.html reads this before paint to avoid a flash.
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* ignore storage errors */
  }
}
