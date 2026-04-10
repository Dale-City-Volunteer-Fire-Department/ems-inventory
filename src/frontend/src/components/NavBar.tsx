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
  { path: '/orders', label: 'Orders', icon: 'truck', minRole: 'logistics' },
  { path: '/admin', label: 'Admin', icon: 'cog', minRole: 'admin' },
];

const ROLE_RANK: Record<UserRole, number> = {
  crew: 0,
  logistics: 1,
  admin: 2,
};

interface NavBarProps {
  role: UserRole;
}

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = `h-6 w-6 transition-colors ${active ? 'text-dcvfd-accent' : 'text-zinc-500'}`;
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

export default function NavBar({ role }: NavBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRank = ROLE_RANK[role];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userRank >= ROLE_RANK[item.minRole];
  });

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface/95 backdrop-blur-md safe-area-pb md:hidden">
      <div className="flex justify-around py-2">
        {visibleItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex min-w-[64px] flex-col items-center gap-0.5 px-3 py-1 transition-all ${
                active ? 'border-t-2 border-dcvfd-accent -mt-[2px]' : ''
              }`}
            >
              <NavIcon icon={item.icon} active={active} />
              <span className={`text-xs transition-colors ${active ? 'text-dcvfd-accent font-medium' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
