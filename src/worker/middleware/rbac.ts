// Role-based access control middleware

import type { UserRole } from '../../shared/types';
import type { Session } from '../auth/session';
import { forbidden } from '../lib/response';

/**
 * Role hierarchy — higher index = more permissions.
 * admin > logistics > crew
 */
const ROLE_HIERARCHY: UserRole[] = ['crew', 'logistics', 'admin'];

/**
 * Check if a user's role meets the minimum required role.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

/**
 * Returns a 403 response if the session's role is insufficient.
 * Use in route handlers:
 *   const denied = requireRole(session, 'logistics'); if (denied) return denied;
 */
export function requireRole(session: Session, requiredRole: UserRole): Response | null {
  if (!hasRole(session.role, requiredRole)) {
    return forbidden(`Requires ${requiredRole} role or higher`);
  }
  return null;
}

/**
 * RBAC rules summary:
 * - crew: inventory submission, own station history
 * - logistics: everything crew can do + all stations + orders + stock targets + items
 * - admin: everything
 */
