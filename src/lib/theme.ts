import type { ThemePref } from '@/db/types'
import type { AppTheme } from '@/lib/palette'

const KEY = 'ft-theme'
const APP_THEME_KEY = 'ft-app-theme'

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

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-app-theme', theme)
  try {
    // index.html reads this before paint to avoid a flash.
    localStorage.setItem(APP_THEME_KEY, theme)
  } catch {
    /* ignore storage errors */
  }
}
