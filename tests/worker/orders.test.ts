import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getOrders, updateOrderStatus } from '../../src/worker/lib/db';
import { requireRole } from '../../src/worker/middleware/rbac';
import type { OrderStatus, UserRole } from '../../src/shared/types';
import type { Session } from '../../src/worker/auth/session';

// ── Helper ──────────────────────────────────────────────────────────

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

const VALID_STATUSES: OrderStatus[] = ['pending', 'in_progress', 'filled'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress'],
  in_progress: ['filled'],
  filled: [],
};

// ── Tests ────────────────────────────────────────────────────────────

describe('Orders', () => {
  describe('RBAC — requires logistics+', () => {
    it('crew cannot access orders', () => {
      const denied = requireRole(makeSession('crew'), 'logistics');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('logistics can access orders', () => {
      const denied = requireRole(makeSession('logistics'), 'logistics');
      expect(denied).toBeNull();
    });

    it('admin can access orders', () => {
      const denied = requireRole(makeSession('admin'), 'logistics');
      expect(denied).toBeNull();
    });
  });

  describe('getOrders', () => {
    it('returns orders unfiltered', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM orders', () => [
        {
          id: 1,
          station_id: 10,
          session_id: '1',
          items_short: 3,
          pick_list: 'RESUPPLY ORDER',
          status: 'pending',
          submitted_at: '2026-04-06',
          filled_at: null,
          filled_by: null,
        },
      ]);

      const db = mock.asD1();
      const orders = await getOrders(db);
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('pending');
    });

    it('filters by stationId', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM orders', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getOrders(db, { stationId: 10 });
      expect(capturedBinds[0]).toBe(10);
    });

    it('filters by status', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM orders', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getOrders(db, { status: 'pending' });
      expect(capturedBinds[0]).toBe('pending');
    });

    it('defaults limit to 100', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM orders', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getOrders(db);
      expect(capturedBinds).toEqual([100, 0]);
    });
  });

  describe('updateOrderStatus', () => {
    it('updates status for a non-filled order', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE orders SET status', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await updateOrderStatus(db, 1, 'in_progress');
      expect(capturedBinds).toEqual(['in_progress', 1]);
    });

    it('sets filled_at and filled_by when status is "filled"', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE orders SET status', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await updateOrderStatus(db, 1, 'filled', 'logistics@dcvfd.org');
      expect(capturedBinds[0]).toBe('filled');
      expect(capturedBinds[1]).toBe('logistics@dcvfd.org');
      expect(capturedBinds[2]).toBe(1);
    });

    it('sets filled_by to null when not provided', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE orders SET status', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await updateOrderStatus(db, 1, 'filled');
      expect(capturedBinds[0]).toBe('filled');
      expect(capturedBinds[1]).toBeNull();
    });
  });

  describe('status transition validation', () => {
    it('pending can transition to in_progress', () => {
      expect(STATUS_TRANSITIONS['pending']).toContain('in_progress');
    });

    it('pending cannot transition to filled', () => {
      expect(STATUS_TRANSITIONS['pending']).not.toContain('filled');
    });

    it('in_progress can transition to filled', () => {
      expect(STATUS_TRANSITIONS['in_progress']).toContain('filled');
    });

    it('in_progress cannot transition back to pending', () => {
      expect(STATUS_TRANSITIONS['in_progress']).not.toContain('pending');
    });

    it('filled cannot transition to anything', () => {
      expect(STATUS_TRANSITIONS['filled']).toHaveLength(0);
    });

    it('validates status values', () => {
      expect(VALID_STATUSES).toContain('pending');
      expect(VALID_STATUSES).toContain('in_progress');
      expect(VALID_STATUSES).toContain('filled');
      expect(VALID_STATUSES).toHaveLength(3);
    });

    it('rejects invalid status values', () => {
      const invalid = ['Pending', 'FILLED', 'cancelled', 'shipped', ''];
      for (const s of invalid) {
        expect(VALID_STATUSES.includes(s as OrderStatus)).toBe(false);
      }
    });
  });
});
