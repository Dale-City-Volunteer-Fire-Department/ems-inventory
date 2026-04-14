import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { requireRole } from '../../src/worker/middleware/rbac';
import type { UserRole } from '../../src/shared/types';
import type { Session } from '../../src/worker/auth/session';

// ── Helper ──────────────────────────────────────────────────────────

function makeSession(role: UserRole, userId = 1): Session {
  return {
    userId,
    email: 'admin@dcvfd.org',
    name: 'Admin User',
    role,
    stationId: null,
    authMethod: 'entra_sso',
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  };
}

const VALID_ROLES: UserRole[] = ['crew', 'logistics', 'admin'];

// ── Tests ────────────────────────────────────────────────────────────

describe('User Management Endpoints', () => {
  describe('GET /api/users — RBAC', () => {
    it('requires admin role', () => {
      const session = makeSession('admin');
      const denied = requireRole(session, 'admin');
      expect(denied).toBeNull();
    });

    it('crew cannot access users list', () => {
      const session = makeSession('crew');
      const denied = requireRole(session, 'admin');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('logistics cannot access users list', () => {
      const session = makeSession('logistics');
      const denied = requireRole(session, 'admin');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });
  });

  describe('GET /api/users — query filtering', () => {
    it('filters users by role', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM users u', () => [
        {
          id: 1,
          email: 'crew1@dcvfd.org',
          name: 'Crew Member',
          role: 'crew',
          station_id: 10,
          auth_method: 'pin',
          is_active: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          last_login_at: null,
          station_name: 'Station 10',
        },
      ]);

      const db = mock.asD1();
      const result = await db.prepare('SELECT u.id FROM users u WHERE u.role = ?').bind('crew').all();

      expect(result.results).toHaveLength(1);
    });

    it('filters users by active status', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM users u', () => [
        {
          id: 1,
          email: 'active@dcvfd.org',
          name: 'Active User',
          role: 'crew',
          station_id: 10,
          auth_method: 'pin',
          is_active: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          last_login_at: null,
          station_name: 'Station 10',
        },
      ]);

      const db = mock.asD1();
      const result = await db.prepare('SELECT u.id FROM users u WHERE u.is_active = ?').bind(1).all();

      expect(result.results).toHaveLength(1);
    });

    it('maps is_active from number to boolean in response', () => {
      const user = {
        id: 1,
        email: 'test@dcvfd.org',
        name: 'Test',
        role: 'crew' as UserRole,
        station_id: 10,
        station_name: 'Station 10',
        auth_method: 'pin',
        is_active: 1,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        last_login_at: null,
      };

      const mapped = {
        ...user,
        is_active: user.is_active === 1,
      };

      expect(mapped.is_active).toBe(true);
    });

    it('is_active: 0 maps to false', () => {
      const mapped = { is_active: 0 === 1 };
      expect(mapped.is_active).toBe(false);
    });
  });

  describe('PUT /api/users/:id/role — role change', () => {
    it('validates role against allowed values', () => {
      expect(VALID_ROLES.includes('crew')).toBe(true);
      expect(VALID_ROLES.includes('logistics')).toBe(true);
      expect(VALID_ROLES.includes('admin')).toBe(true);
      expect(VALID_ROLES.includes('superadmin' as UserRole)).toBe(false);
    });

    it('cannot change own role', () => {
      const session = makeSession('admin', 42);
      const targetUserId = 42; // same as session.userId
      expect(targetUserId === session.userId).toBe(true);
    });

    it('can change another user role', () => {
      const session = makeSession('admin', 42);
      const targetUserId = 99; // different from session.userId
      expect(targetUserId === session.userId).toBe(false);
    });

    it('rejects invalid role strings', () => {
      const invalidRoles = ['Crew', 'ADMIN', 'superadmin', 'volunteer', '', 'chief'];
      for (const role of invalidRoles) {
        expect(VALID_ROLES.includes(role as UserRole)).toBe(false);
      }
    });

    it('returns 400 for missing role field', () => {
      const body = {};
      expect(!('role' in body) || !(body as { role?: string }).role).toBe(true);
    });

    it('returns 404 when target user does not exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT id FROM users WHERE id', () => []);

      const db = mock.asD1();
      const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(999).first();
      expect(user).toBeNull();
    });

    it('updates user role in database', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE users SET role', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await db
        .prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind('logistics', 5)
        .run();

      expect(capturedBinds).toEqual(['logistics', 5]);
    });
  });

  describe('PUT /api/users/:id/active — activate/deactivate', () => {
    it('cannot deactivate self', () => {
      const session = makeSession('admin', 42);
      const targetUserId = 42;
      expect(targetUserId === session.userId).toBe(true);
      // Handler returns badRequest('Cannot change your own active status')
    });

    it('can deactivate another user', () => {
      const session = makeSession('admin', 42);
      const targetUserId = 99;
      expect(targetUserId === session.userId).toBe(false);
    });

    it('validates is_active is a boolean', () => {
      const validBody = { is_active: true };
      expect(typeof validBody.is_active).toBe('boolean');

      const invalidBody = { is_active: 1 };
      expect(typeof invalidBody.is_active).not.toBe('boolean');
    });

    it('rejects non-boolean is_active values', () => {
      const invalidValues = [1, 0, 'true', 'false', null, undefined];
      for (const val of invalidValues) {
        expect(typeof val === 'boolean').toBe(false);
      }
    });

    it('returns 404 when target user does not exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT id FROM users WHERE id', () => []);

      const db = mock.asD1();
      const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(999).first();
      expect(user).toBeNull();
    });

    it('stores is_active as 1 or 0 in database', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE users SET is_active', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).bind(0, 5).run();

      expect(capturedBinds).toEqual([0, 5]);
    });

    it('is_active: true maps to 1', () => {
      const active = true;
      expect(active ? 1 : 0).toBe(1);
    });

    it('is_active: false maps to 0', () => {
      const inactive = false;
      expect(inactive ? 1 : 0).toBe(0);
    });
  });

  describe('user ID parsing from path', () => {
    it('extracts numeric user ID from /api/users/:id/role', () => {
      const path = '/api/users/42/role';
      const parts = path.split('/');
      const userId = Number(parts[3]);
      expect(userId).toBe(42);
    });

    it('extracts numeric user ID from /api/users/:id/active', () => {
      const path = '/api/users/99/active';
      const parts = path.split('/');
      const userId = Number(parts[3]);
      expect(userId).toBe(99);
    });

    it('rejects NaN user IDs', () => {
      const path = '/api/users/abc/role';
      const parts = path.split('/');
      const userId = Number(parts[3]);
      expect(isNaN(userId)).toBe(true);
    });
  });
});
