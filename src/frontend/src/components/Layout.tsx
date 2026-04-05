import type { ReactNode } from 'react';
import type { UserRole } from '@shared/types';
import Header from './Header';
import Sidebar from './Sidebar';
import NavBar from './NavBar';

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
  return (
    <div className="min-h-dvh bg-neutral-950">
      <Sidebar role={role} userName={userName} />
      <Header />

      {/* Main content — offset on desktop for sidebar */}
      <main className="md:ml-64">
        {children}
      </main>

      <NavBar role={role} />
    </div>
  );
}
