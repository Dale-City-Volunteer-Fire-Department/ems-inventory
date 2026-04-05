import { useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '@shared/types';

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
}

function SidebarIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = `h-5 w-5 ${active ? 'text-white' : 'text-neutral-300'}`;
  switch (icon) {
    case 'clipboard':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
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
            strokeWidth={2}
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
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({ role, userName }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRank = ROLE_RANK[role];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userRank >= ROLE_RANK[item.minRole];
  });

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-dcvfd z-30">
      {/* Logo + App Name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-dcvfd-light">
        <img src="/dcvfd-logo.svg" alt="DCVFD" className="h-10 w-auto" />
        <div>
          <div className="text-sm font-bold text-white leading-tight">DCVFD</div>
          <div className="text-xs text-dcvfd-accent leading-tight">EMS Inventory</div>
        </div>
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
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-dcvfd-light text-white'
                  : 'text-neutral-300 hover:bg-dcvfd-light/50 hover:text-white'
              }`}
            >
              <SidebarIcon icon={item.icon} active={active} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User info at bottom */}
      <div className="px-4 py-4 border-t border-dcvfd-light">
        <div className="text-sm text-white font-medium truncate">{userName ?? 'User'}</div>
        <div className="text-xs text-dcvfd-accent capitalize">{role}</div>
      </div>
    </aside>
  );
}
