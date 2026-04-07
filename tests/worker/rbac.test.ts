import { describe, it, expect } from 'vitest';
import { hasRole, requireRole } from '../../src/worker/middleware/rbac';
import type { UserRole } from '../../src/shared/types';
import type { Session } from '../../src/worker/auth/session';

// ── Helper: build a session with a given role ───────────────────────

function makeSession(role: UserRole): Session {
  return {
    userId: 1,
    email: 'test@dcvfd.org',
    name: 'Test User',
    role,
    stationId: 10,
    authMethod: 'pin',
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('RBAC Enforcement', () => {
  describe('hasRole — role hierarchy checks', () => {
    it('crew meets crew requirement', () => {
      expect(hasRole('crew', 'crew')).toBe(true);
    });

    it('crew does NOT meet logistics requirement', () => {
      expect(hasRole('crew', 'logistics')).toBe(false);
    });

    it('crew does NOT meet admin requirement', () => {
      expect(hasRole('crew', 'admin')).toBe(false);
    });

    it('logistics meets crew requirement', () => {
      expect(hasRole('logistics', 'crew')).toBe(true);
    });

    it('logistics meets logistics requirement', () => {
      expect(hasRole('logistics', 'logistics')).toBe(true);
    });

    it('logistics does NOT meet admin requirement', () => {
      expect(hasRole('logistics', 'admin')).toBe(false);
    });

    it('admin meets crew requirement', () => {
      expect(hasRole('admin', 'crew')).toBe(true);
    });

    it('admin meets logistics requirement', () => {
      expect(hasRole('admin', 'logistics')).toBe(true);
    });

    it('admin meets admin requirement', () => {
      expect(hasRole('admin', 'admin')).toBe(true);
    });
  });

  describe('role hierarchy ordering', () => {
    it('admin > logistics > crew', () => {
      // admin can do everything logistics can
      expect(hasRole('admin', 'logistics')).toBe(true);
      // logistics can do everything crew can
      expect(hasRole('logistics', 'crew')).toBe(true);
      // but not the other direction
      expect(hasRole('crew', 'logistics')).toBe(false);
      expect(hasRole('logistics', 'admin')).toBe(false);
    });

    it('each role meets its own requirement', () => {
      const roles: UserRole[] = ['crew', 'logistics', 'admin'];
      for (const role of roles) {
        expect(hasRole(role, role)).toBe(true);
      }
    });
  });

  describe('requireRole — returns null or 403 Response', () => {
    it('returns null (pass) when crew accesses crew-level route', () => {
      const session = makeSession('crew');
      const result = requireRole(session, 'crew');
      expect(result).toBeNull();
    });

    it('returns 403 when crew accesses logistics-level route', () => {
      const session = makeSession('crew');
      const result = requireRole(session, 'logistics');
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(403);
    });

    it('returns 403 when crew accesses admin-level route', () => {
      const session = makeSession('crew');
      const result = requireRole(session, 'admin');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('returns null (pass) when logistics accesses logistics-level route', () => {
      const session = makeSession('logistics');
      const result = requireRole(session, 'logistics');
      expect(result).toBeNull();
    });

    it('returns null (pass) when logistics accesses crew-level route', () => {
      const session = makeSession('logistics');
      const result = requireRole(session, 'crew');
      expect(result).toBeNull();
    });

    it('returns 403 when logistics accesses admin-level route', () => {
      const session = makeSession('logistics');
      const result = requireRole(session, 'admin');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('returns null (pass) when admin accesses admin-level route', () => {
      const session = makeSession('admin');
      const result = requireRole(session, 'admin');
      expect(result).toBeNull();
    });

    it('returns null (pass) when admin accesses logistics-level route', () => {
      const session = makeSession('admin');
      const result = requireRole(session, 'logistics');
      expect(result).toBeNull();
    });

    it('returns null (pass) when admin accesses crew-level route', () => {
      const session = makeSession('admin');
      const result = requireRole(session, 'crew');
      expect(result).toBeNull();
    });

    it('403 response body contains the required role name', async () => {
      const session = makeSession('crew');
      const result = requireRole(session, 'logistics');
      expect(result).not.toBeNull();
      const body = await result!.json() as { error: string };
      expect(body.error).toContain('logistics');
    });

    it('403 response body contains "role or higher" message', async () => {
      const session = makeSession('crew');
      const result = requireRole(session, 'admin');
      expect(result).not.toBeNull();
      const body = await result!.json() as { error: string };
      expect(body.error).toContain('admin');
      expect(body.error).toContain('role or higher');
    });
  });

  describe('route-level RBAC enforcement patterns', () => {
    it('crew cannot access /api/orders (logistics-only)', () => {
      const session = makeSession('crew');
      const denied = requireRole(session, 'logistics');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('logistics can access /api/orders', () => {
      const session = makeSession('logistics');
      const denied = requireRole(session, 'logistics');
      expect(denied).toBeNull();
    });

    it('admin can access /api/orders', () => {
      const session = makeSession('admin');
      const denied = requireRole(session, 'logistics');
      expect(denied).toBeNull();
    });

    it('crew cannot access /api/users (admin-only)', () => {
      const session = makeSession('crew');
      const denied = requireRole(session, 'admin');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('logistics cannot access /api/users (admin-only)', () => {
      const session = makeSession('logistics');
      const denied = requireRole(session, 'admin');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('admin can access /api/users', () => {
      const session = makeSession('admin');
      const denied = requireRole(session, 'admin');
      expect(denied).toBeNull();
    });
  });
});
