import { NavLink } from 'react-router-dom';
import { Plus, Clock, BarChart3, ShieldCheck, User, LogOut } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

const itemClass = ({ isActive }) =>
  `relative grid size-9 place-items-center rounded-md transition-colors hover:text-ink ${
    isActive ? 'text-ink before:absolute before:-left-2 before:h-5 before:w-0.5 before:bg-crimson' : 'text-muted'
  }`;

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-13 shrink-0 flex-col items-center justify-between border-r border-line bg-surface py-4"
    >
      <NavLink to="/" end aria-label="New chat" className={itemClass}>
        <Plus size={18} />
      </NavLink>

      <div className="flex flex-col gap-2">
        <NavLink to="/chat" aria-label="History" className={itemClass}><Clock size={18} /></NavLink>
        <NavLink to="/report" aria-label="Report" className={itemClass}><BarChart3 size={18} /></NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/admin/policies" aria-label="Admin" className={itemClass}><ShieldCheck size={18} /></NavLink>
        )}
      </div>

      <button
        onClick={logout}
        aria-label={`Sign out ${user?.name ?? ''}`}
        title="Sign out"
        className="group grid size-8 place-items-center rounded-full border border-line bg-transparent text-muted hover:text-ink"
      >
        <User size={14} className="group-hover:hidden" />
        <LogOut size={14} className="hidden group-hover:block" />
      </button>
    </nav>
  );
}