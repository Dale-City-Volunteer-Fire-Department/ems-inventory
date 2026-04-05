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

interface NavBarProps {
  role: UserRole;
}

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const cls = `h-6 w-6 ${active ? 'text-blue-400' : 'text-neutral-500'}`;
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

export default function NavBar({ role }: NavBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRank = ROLE_RANK[role];

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return userRank >= ROLE_RANK[item.minRole];
  });

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-sm safe-area-pb">
      <div className="flex justify-around py-2">
        {visibleItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="flex min-w-[64px] flex-col items-center gap-0.5 px-3 py-1"
            >
              <NavIcon icon={item.icon} active={active} />
              <span className={`text-xs ${active ? 'text-blue-400 font-medium' : 'text-neutral-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
