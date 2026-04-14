import { useState, type ReactNode } from 'react';
import type { UserRole } from '@shared/types';
import Header from './Header';
import Sidebar from './Sidebar';
import NavBar from './NavBar';
import ProfileModal from './ProfileModal';

interface LayoutProps {
  children: ReactNode;
  role: UserRole;
  userName?: string;
}

/**
 * Responsive shell:
 * - Mobile: Header (logo+name) at top, content, bottom NavBar
 * - Desktop (md+): Fixed sidebar on left (w-64), main content area on right
 */
export default function Layout({ children, role, userName }: LayoutProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-dvh bg-surface">
      <Sidebar
        role={role}
        userName={userName}
        onProfileClick={() => setProfileOpen(true)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <Header onProfileClick={() => setProfileOpen(true)} />

      {/* Main content — offset on desktop for sidebar */}
      <main className={collapsed ? 'md:ml-16' : 'md:ml-64'}>{children}</main>

      <NavBar role={role} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
