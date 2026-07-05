import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { ChartIcon, ListIcon, MenuIcon, PlusIcon } from './icons'

const tabs = [
  { to: '/', label: 'Add', Icon: PlusIcon, end: true },
  { to: '/transactions', label: 'Activity', Icon: ListIcon, end: false },
  { to: '/insights', label: 'Insights', Icon: ChartIcon, end: false },
  { to: '/more', label: 'More', Icon: MenuIcon, end: false },
]

export default function TabBar() {
  return (
    <nav className="border-t border-border bg-bg/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch pt-1">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted hover:text-content',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-primary/10',
                  )}
                >
                  <Icon size={22} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
