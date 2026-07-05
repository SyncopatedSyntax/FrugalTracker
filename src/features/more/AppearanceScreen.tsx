import SubScreen from '@/components/SubScreen'
import { CheckIcon, MoonIcon, PaletteIcon, SunIcon } from '@/components/icons'
import { useSettings } from '@/hooks'
import { updateSettings } from '@/db/repo'
import type { ThemePref } from '@/db/types'
import { cn } from '@/lib/cn'

const options: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: PaletteIcon },
]

export default function AppearanceScreen() {
  const settings = useSettings()
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
      </div>
    </SubScreen>
  )
}
