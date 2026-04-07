import { useAuth } from '../hooks/useAuth';
import { UserAvatar } from './Sidebar';

interface HeaderProps {
  onProfileClick?: () => void;
}

/**
 * Mobile-only header with DCVFD branding.
 * Hidden on desktop (sidebar takes over).
 */
export default function Header({ onProfileClick }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="md:hidden sticky top-0 z-20 bg-dcvfd-dark/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <img src="/dcvfd-badge.svg" alt="DCVFD" className="h-8 w-auto" />
          <h1 className="text-base font-bold text-white tracking-tight">EMS Inventory</h1>
        </div>
        {user && (
          <button type="button" onClick={onProfileClick} className="p-0.5">
            <UserAvatar name={user.name} photoUrl={user.photoUrl} size="sm" />
          </button>
        )}
      </div>
      <div className="h-0.5 bg-gradient-to-r from-dcvfd-accent/60 via-dcvfd-accent to-dcvfd-accent/60" />
    </header>
  );
}
