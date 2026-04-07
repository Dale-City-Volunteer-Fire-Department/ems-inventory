import { useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '@shared/types';
import { useAuth } from '../hooks/useAuth';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  minRole?: UserRole;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/inventory', label: 'Inventory', icon: 'clipboard' },
  { path: '/dashboard', label: 'Dashboard', icon: 'chart', minRole: 'logistics' },
  { path: '/admin', label: 'Admin', icon: 'cog', minRole: 'admin' },
];

const ROLE_RANK: Record<UserRole, number> = {
  crew: 0,
  logistics: 1,
  admin: 2,
};

interface SidebarProps {
  role: UserRole;
  userName?: string;
  onProfileClick?: () => void;
}

function SidebarIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = `h-5 w-5 transition-colors ${active ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`;
  switch (icon) {
    case 'clipboard':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      );
    case 'chart':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );
    case 'cog':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

function UserAvatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl?: string | null; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${dims} rounded-full object-cover ring-2 ring-dcvfd-accent/30`} />;
  }

  return (
    <div className={`${dims} rounded-full bg-dcvfd-accent/20 text-dcvfd-accent font-semibold flex items-center justify-center ring-2 ring-dcvfd-accent/20 shrink-0`}>
      {initials}
    </div>
  );
}

export { UserAvatar };

export default function Sidebar({ role, userName, onProfileClick }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const userRank = ROLE_RANK[role];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userRank >= ROLE_RANK[item.minRole];
  });

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-dcvfd-dark z-30 border-r border-dcvfd/50">
      {/* Logo */}
      <div className="flex items-center justify-center px-5 py-5 border-b border-dcvfd/40">
        <img src="/dcvfd-logo-wide.svg" alt="DCVFD" className="h-10 w-auto" />
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-dcvfd-light text-white shadow-sm'
                  : 'text-zinc-300 hover:bg-dcvfd/40 hover:text-white'
              }`}
            >
              <SidebarIcon icon={item.icon} active={active} />
              {item.label}
              {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-dcvfd-accent pulse-dot" />}
            </button>
          );
        })}
      </nav>

      {/* User info at bottom */}
      <div className="border-t border-dcvfd/40 p-3 space-y-2">
        <button
          type="button"
          onClick={onProfileClick}
          className="w-full flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-dcvfd/40 transition-colors text-left"
        >
          <UserAvatar name={userName ?? 'User'} photoUrl={user?.photoUrl} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white font-medium truncate">{userName ?? 'User'}</div>
            <div className="text-xs text-dcvfd-accent capitalize">{role}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-dcvfd/40 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
