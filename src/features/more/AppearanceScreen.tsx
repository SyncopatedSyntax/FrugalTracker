import { useEffect, useState } from 'react'
import SubScreen from '@/components/SubScreen'
import Sheet from '@/components/Sheet'
import { Toast, useToast } from '@/components/Toast'
import { CheckIcon, MoonIcon, PaletteIcon, RefreshIcon, SunIcon } from '@/components/icons'
import { useIsDark, useSettings } from '@/hooks'
import { recolorCategories, updateSettings } from '@/db/repo'
import type { ThemePref } from '@/db/types'
import { alphaHex, APP_THEMES, categoryPalette, type AppTheme } from '@/lib/palette'
import { cn } from '@/lib/cn'

/** A few representative icon+color pairs, cycled against the active theme's
 * own palette, to preview the icon-chip alpha live without leaving this screen. */
const PREVIEW_ICONS = ['🛒', '☕', '🎬', '🏠', '✈️']

const options: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: PaletteIcon },
]

export default function AppearanceScreen() {
  const settings = useSettings()
  const isDark = useIsDark()
  const { message, show } = useToast()
  const [confirmRecolor, setConfirmRecolor] = useState(false)

  const activeTheme = APP_THEMES.find((t) => t.id === settings.appTheme) ?? APP_THEMES[0]

  // Local state so the slider and preview chips track the drag instantly,
  // rather than waiting on the round-trip through Dexie's live query.
  const [previewAlpha, setPreviewAlpha] = useState(settings.categoryIconAlpha)
  useEffect(() => setPreviewAlpha(settings.categoryIconAlpha), [settings.categoryIconAlpha])
  const previewPalette = categoryPalette(settings.appTheme)

  const doRecolor = async () => {
    await recolorCategories(settings.appTheme)
    setConfirmRecolor(false)
    show(`Categories recolored to ${activeTheme.name}`)
  }

  return (
    <SubScreen title="Appearance">
      <div className="px-4 py-4">
        <div className="overflow-hidden rounded-[1.375rem] bg-surface">
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
                  'flex w-full items-start gap-3 rounded-[1.375rem] bg-surface p-3 text-left transition-shadow',
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

        <button
          type="button"
          onClick={() => setConfirmRecolor(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[1.375rem] border border-dashed border-border py-3 text-sm font-medium text-muted active:bg-surface2"
        >
          <RefreshIcon size={16} />
          Recolor categories to match {activeTheme.name}
        </button>

        <p className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Category icon boldness
        </p>
        <p className="mb-3 px-1 text-xs text-muted">
          How strongly a category's color shows through its round icon background on Activity,
          Categories, Budgets, the Edit screen, and Insights.
        </p>
        <div className="rounded-[1.375rem] bg-surface p-4">
          <div className="mb-3 flex items-center justify-center gap-2.5">
            {PREVIEW_ICONS.map((icon, i) => (
              <span
                key={icon}
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-lg"
                style={{
                  backgroundColor:
                    previewPalette[i % previewPalette.length] + alphaHex(previewAlpha),
                }}
              >
                {icon}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={previewAlpha}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPreviewAlpha(v)
                void updateSettings({ categoryIconAlpha: v })
              }}
              className="h-1.5 flex-1 accent-[rgb(var(--c-primary))]"
              aria-label="Category icon boldness"
            />
            <span className="w-10 flex-shrink-0 text-right text-sm font-semibold tabular-nums">
              {previewAlpha}%
            </span>
          </div>
        </div>
      </div>

      <Toast message={message} />

      <Sheet
        open={confirmRecolor}
        onClose={() => setConfirmRecolor(false)}
        title="Recolor all categories?"
      >
        <p className="text-sm text-muted">
          Every category's color will be reassigned from {activeTheme.name}'s palette, in list
          order — including any you've customized by hand. You can always change a category's
          color again afterward.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setConfirmRecolor(false)}
            className="flex-1 rounded-[1.375rem] border border-border py-3 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={doRecolor}
            className="flex-1 rounded-[1.375rem] bg-primary py-3 text-sm font-semibold text-primary-fg"
          >
            Recolor
          </button>
        </div>
      </Sheet>
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
