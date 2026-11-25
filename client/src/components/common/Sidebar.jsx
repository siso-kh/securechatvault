import { NavLink } from 'react-router-dom'
import {
  Users, ShieldCheck, LayoutDashboard, Home, MessageSquare, History, BarChart3,
  ScrollText, User, LogOut,
} from 'lucide-react'
import useAuth from '../../hooks/useAuth'

const itemClass = ({ isActive }) =>
  `relative grid size-9 place-items-center rounded-md transition-colors hover:text-ink ${
    isActive
      ? 'text-ink before:absolute before:-left-2 before:h-5 before:w-0.5 before:bg-crimson'
      : 'text-muted'
  }`

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/policies', label: 'Policies', icon: ShieldCheck },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
]

const USER_NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/history', label: 'History', icon: History },
  { to: '/report', label: 'Report', icon: BarChart3 },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const items = user?.role === 'admin' ? ADMIN_NAV : USER_NAV

  return (
    <nav
      aria-label={user?.role === 'admin' ? 'Admin navigation' : 'Main navigation'}
      className="flex h-full w-13 shrink-0 flex-col items-center justify-between bg-surface py-4"
    >
      <div className="flex flex-1 flex-col justify-center gap-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            className={itemClass}
          >
            <Icon size={18} />
          </NavLink>
        ))}
      </div>

      {/* Profile and logout */}
      <button
        onClick={logout}
        aria-label="Sign out"
        title="Sign out"
        className="group grid size-8 place-items-center rounded-full border border-line bg-transparent text-muted hover:text-ink"
      >
        <User size={14} className="group-hover:hidden" />
        <LogOut size={14} className="hidden group-hover:block" />
      </button>
    </nav>
  )
}
