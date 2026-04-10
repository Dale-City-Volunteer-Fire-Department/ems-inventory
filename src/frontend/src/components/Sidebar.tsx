import { useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '@shared/types';
import { useAuth } from '../hooks/useAuth';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  minRole?: UserRole;
  prominent?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/inventory', label: 'New Inventory', icon: 'clipboard', prominent: true },
  { path: '/dashboard', label: 'Dashboard', icon: 'chart', minRole: 'logistics' },
  { path: '/inventories', label: 'Inventories', icon: 'list', minRole: 'logistics' },
  { path: '/orders', label: 'Orders', icon: 'truck', minRole: 'logistics' },
  { path: '/par', label: 'PAR Management', icon: 'sliders', minRole: 'logistics' },
  { path: '/admin', label: 'Users', icon: 'users', minRole: 'admin' },
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SidebarIcon({ icon, active, prominent }: { icon: string; active: boolean; prominent?: boolean }) {
  const cls = `h-5 w-5 transition-colors ${
    prominent ? 'text-white' : active ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'
  }`;
  switch (icon) {
    case 'clipboard':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
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
    case 'list':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'truck':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
          />
        </svg>
      );
    case 'sliders':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function UserAvatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl?: string | null; size?: 'sm' | 'md' }) {
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

export default function Sidebar({ role, userName, onProfileClick, collapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRank = ROLE_RANK[role];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userRank >= ROLE_RANK[item.minRole];
  });

  return (
    <aside
      className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-dcvfd-dark z-30 border-r border-dcvfd/50 relative transition-all duration-200 ${
        collapsed ? 'md:w-16' : 'md:w-64'
      }`}
    >
      {/* Collapse toggle button */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="absolute top-1/2 -right-3 z-40 h-6 w-6 -translate-y-1/2 rounded-full bg-[#0a1f1c] border border-dcvfd-dark flex items-center justify-center hover:bg-dcvfd-dark transition-colors shadow-sm"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Logo */}
      <div className="flex items-center justify-center px-5 py-5 border-b border-dcvfd/40">
        {collapsed ? (
          <img src="/dcvfd-badge.svg" alt="DCVFD" className="h-8 w-8" />
        ) : (
          <img src="/dcvfd-logo-wide.svg" alt="DCVFD" className="h-10 w-auto" />
        )}
      </div>

      {/* Nav Links */}
      <nav className={`flex-1 py-2 space-y-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {visibleItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          if (item.prominent) {
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
                className={`group flex w-full items-center rounded-lg text-sm font-semibold transition-all mb-2 ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                } ${
                  active
                    ? 'bg-dcvfd-accent text-white shadow-md shadow-dcvfd-accent/25'
                    : 'bg-dcvfd-accent/90 text-white hover:bg-dcvfd-accent hover:shadow-md hover:shadow-dcvfd-accent/25'
                }`}
              >
                <svg className="h-5 w-5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {!collapsed && item.label}
              </button>
            );
          }
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`group flex w-full items-center rounded-lg text-sm font-medium transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-dcvfd-light text-white shadow-sm'
                  : 'text-zinc-300 hover:bg-dcvfd/40 hover:text-white'
              }`}
            >
              <SidebarIcon icon={item.icon} active={active} />
              {!collapsed && item.label}
              {!collapsed && active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-dcvfd-accent pulse-dot" />}
            </button>
          );
        })}
      </nav>

      {/* User info at bottom */}
      <div className={`border-t border-dcvfd/40 ${collapsed ? 'p-1.5' : 'p-3'}`}>
        <button
          type="button"
          onClick={onProfileClick}
          title={collapsed ? (userName ?? 'User') : undefined}
          className={`w-full flex items-center rounded-lg py-2 hover:bg-dcvfd/40 transition-colors ${
            collapsed ? 'justify-center px-0' : 'gap-3 px-2 text-left'
          }`}
        >
          <UserAvatar name={userName ?? 'User'} photoUrl={user?.photoUrl} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white font-medium truncate">{userName ?? 'User'}</div>
              <div className="text-xs text-dcvfd-accent capitalize">{role}</div>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
