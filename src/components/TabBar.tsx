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
    <nav className="border-b border-t border-border bg-bg/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center pb-0.5 pt-0.5 text-[10px] font-medium leading-none transition-colors',
                isActive ? 'text-primary' : 'text-muted hover:text-content',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'mb-0.5 flex items-center justify-center rounded-full px-2 py-0.5 transition-colors',
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
