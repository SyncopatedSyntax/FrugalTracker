import SubScreen from '@/components/SubScreen'
import { CheckIcon, MoonIcon, PaletteIcon, SunIcon } from '@/components/icons'
import { useIsDark, useSettings } from '@/hooks'
import { updateSettings } from '@/db/repo'
import type { ThemePref } from '@/db/types'
import { APP_THEMES, categoryPalette, type AppTheme } from '@/lib/palette'
import { cn } from '@/lib/cn'

const options: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: PaletteIcon },
]

export default function AppearanceScreen() {
  const settings = useSettings()
  const isDark = useIsDark()

  return (
    <SubScreen title="Appearance">
      <div className="px-4 py-4">
        <div className="overflow-hidden rounded-[22px] bg-surface">
          {options.map(({ value, label, Icon }, i) => (
            <button
              key={value}
              onClick={() => updateSettings({ theme: value })}
              className="flex w-full items-center gap-3 px-4 py-3.5 active:bg-surface2"
              style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
            >
              <Icon size={20} className="text-muted" />
              <span className="flex-1 text-left text-sm font-medium">{label}</span>
              {settings.theme === value && (
                <CheckIcon size={20} className={cn('text-primary')} />
              )}
            </button>
          ))}
        </div>

        <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Color theme
        </p>
        <p className="mb-3 px-1 text-xs text-muted">
          Sets the app's own colors and the palette offered when you pick a category color.
          Categories you've already colored keep their color.
        </p>
        <div className="space-y-2">
          {APP_THEMES.map((t) => {
            const active = settings.appTheme === t.id
            return (
              <button
                key={t.id}
                onClick={() => updateSettings({ appTheme: t.id })}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[22px] bg-surface p-3 text-left transition-shadow',
                  active ? 'ring-2 ring-primary' : 'active:bg-surface2',
                )}
              >
                <ThemeSwatch themeId={t.id} isDark={isDark} />
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{t.name}</span>
                    {active && <CheckIcon size={15} className="flex-shrink-0 text-primary" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{t.blurb}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {categoryPalette(t.id).map((c, i) => (
                      <span
                        key={c + i}
                        className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </SubScreen>
  )
}

/** A small self-contained preview of the theme's own bg/surface/accent
 * colors — carries `data-app-theme` (and `.dark` to match the app's current
 * light/dark mode) so it renders with that theme's real CSS variables
 * regardless of which theme is actually active app-wide. */
function ThemeSwatch({ themeId, isDark }: { themeId: AppTheme; isDark: boolean }) {
  return (
    <div
      data-app-theme={themeId}
      className={cn('h-14 w-14 flex-shrink-0 rounded-xl border border-border p-1.5', isDark && 'dark')}
      style={{ backgroundColor: 'rgb(var(--c-bg))' }}
    >
      <div
        className="grid h-full w-full place-items-center rounded-lg"
        style={{ backgroundColor: 'rgb(var(--c-surface))' }}
      >
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-primary))' }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-expense))' }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--c-income))' }} />
        </div>
      </div>
    </div>
  )
}
