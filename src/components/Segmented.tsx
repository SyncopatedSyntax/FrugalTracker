import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  /** Optional accent for the active pill (defaults to primary). */
  activeClass?: string
  /** 'sm' shrinks padding/font for tight spaces (defaults to the normal size). */
  size?: 'md' | 'sm'
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  activeClass,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex rounded-full bg-surface2 p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-full font-semibold transition-colors',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              active
                ? activeClass ?? 'bg-primary text-primary-fg shadow'
                : 'text-muted hover:text-content',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
