import SubScreen from '@/components/SubScreen'
import { CheckIcon } from '@/components/icons'
import { useSettings } from '@/hooks'
import { updateSettings } from '@/db/repo'
import type { CalculatorMode, KeypadReach } from '@/db/types'
import { cn } from '@/lib/cn'

const CALC_OPTS: { value: CalculatorMode; label: string; desc: string }[] = [
  { value: 'inline', label: 'Inline tape', desc: 'Operators and AC / % / = live on the amount pad' },
  { value: 'full', label: 'Full screen', desc: 'A calc button opens a standard calculator (with brackets)' },
]

const REACH_OPTS: { value: KeypadReach; label: string; desc: string }[] = [
  { value: 'center', label: 'Center', desc: 'Full-width keypad (default)' },
  { value: 'left', label: 'Left', desc: 'Hug the left edge for left-thumb use' },
  { value: 'right', label: 'Right', desc: 'Hug the right edge for right-thumb use' },
]

function Group<T extends string>({
  title,
  hint,
  options,
  current,
  onPick,
}: {
  title: string
  hint: string
  options: { value: T; label: string; desc: string }[]
  current: T
  onPick: (v: T) => void
}) {
  return (
    <div className="mb-6">
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mb-2 px-1 text-xs text-muted">{hint}</p>
      <div className="overflow-hidden rounded-[22px] bg-surface">
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => onPick(o.value)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface2"
            style={{ borderTop: i === 0 ? undefined : '1px solid rgb(var(--c-border) / 0.6)' }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted">{o.desc}</span>
            </span>
            {current === o.value && <CheckIcon size={20} className={cn('flex-shrink-0 text-primary')} />}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function KeypadScreen() {
  const settings = useSettings()
  return (
    <SubScreen title="Keypad & calculator">
      <div className="px-4 py-4">
        <Group
          title="Calculator"
          hint="How math folds into the amount step when you split bills or add tips."
          options={CALC_OPTS}
          current={settings.calculatorMode}
          onPick={(v) => updateSettings({ calculatorMode: v })}
        />
        <Group
          title="Keypad reach"
          hint="On a large phone, which thumb the number pad favours. Tap the gutter to flip left⇄right on the fly."
          options={REACH_OPTS}
          current={settings.keypadReach}
          onPick={(v) => updateSettings({ keypadReach: v })}
        />
      </div>
    </SubScreen>
  )
}
