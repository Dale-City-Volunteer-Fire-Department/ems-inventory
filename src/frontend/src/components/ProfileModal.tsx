import { useAuth } from '../hooks/useAuth';
import { UserAvatar } from './Sidebar';
import Modal from './Modal';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  crew: 'Crew Member',
  logistics: 'Logistics',
  admin: 'Administrator',
};

export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="mb-4">
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.name}
              className="h-20 w-20 rounded-full object-cover ring-3 ring-dcvfd-accent/30"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-dcvfd-accent/20 text-dcvfd-accent text-2xl font-bold flex items-center justify-center ring-3 ring-dcvfd-accent/20">
              {user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
        </div>

        {/* Name & role */}
        <h2 className="text-lg font-bold text-white">{user.name}</h2>
        <span className="mt-1 inline-flex items-center rounded-full bg-dcvfd/30 px-3 py-0.5 text-xs font-medium text-dcvfd-accent">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>

        {/* Details */}
        <div className="mt-5 w-full space-y-2 text-left">
          {user.email && (
            <div className="flex items-center gap-3 rounded-lg bg-surface-overlay px-3 py-2.5">
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-zinc-300 truncate">{user.email}</span>
            </div>
          )}
          {user.stationId && (
            <div className="flex items-center gap-3 rounded-lg bg-surface-overlay px-3 py-2.5">
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-sm text-zinc-300">Station {user.stationId}</span>
            </div>
          )}
        </div>

        {/* Training & Help Links */}
        <div className="mt-5 w-full">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 px-1">Resources</h3>
          <div className="space-y-1">
            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-overlay hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              EMS Inventory Guide
            </a>
            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-overlay hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Report an Issue
            </a>
            <a
              href="https://dcvfd.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-surface-overlay hover:text-white transition-colors"
            >
              <svg className="h-4 w-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              DCVFD Member Portal
            </a>
          </div>
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-surface-overlay border border-border-subtle px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white active:scale-[0.98] transition-all"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </Modal>
  );
}
