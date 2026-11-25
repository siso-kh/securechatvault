
import { NavLink } from 'react-router-dom'
import { Users, ShieldCheck, User, LogOut } from 'lucide-react'
import useAuth from '../../hooks/useAuth'

const itemClass = ({ isActive }) =>
  `relative grid size-9 place-items-center rounded-md transition-colors hover:text-ink ${
    isActive
      ? 'text-ink before:absolute before:-left-2 before:h-5 before:w-0.5 before:bg-crimson'
      : 'text-muted'
  }`

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <nav
      aria-label="Admin navigation"
      className="flex h-full w-13 shrink-0 flex-col items-center justify-between bg-surface py-4"
    >
      {/* Admin navigation */}
      <div className="flex flex-1 flex-col justify-center gap-3">

        <NavLink
          to="/admin/users"
          aria-label="Users"
          title="Users"
          className={itemClass}
        >
          <Users size={18} />
        </NavLink>

        <NavLink
          to="/admin/policies"
          aria-label="Policies"
          title="Policies"
          className={itemClass}
        >
          <ShieldCheck size={18} />
        </NavLink>

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
