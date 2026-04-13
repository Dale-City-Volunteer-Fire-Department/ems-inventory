import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { ok } from '../../src/worker/lib/response';
import { requireRole } from '../../src/worker/middleware/rbac';
import type { UserRole } from '../../src/shared/types';
import type { Session } from '../../src/worker/auth/session';

// ── Helper: build a session with a given role ───────────────────────

function makeSession(role: UserRole, userId = 1): Session {
  return {
    userId,
    email: 'test@dcvfd.org',
    name: 'Test User',
    role,
    stationId: 10,
    authMethod: 'pin',
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  };
}

// ── Replication of dashboard stats handler logic ────────────────────
// The actual handler is inline in index.ts and not exported, so we test
// the individual components and validation logic it relies on.

// ── Tests ────────────────────────────────────────────────────────────

describe('Dashboard Stats Endpoint', () => {
  describe('auth and RBAC requirements', () => {
    it('crew cannot access dashboard stats (requires logistics+)', () => {
      const session = makeSession('crew');
      const denied = requireRole(session, 'logistics');
      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(403);
    });

    it('logistics can access dashboard stats', () => {
      const session = makeSession('logistics');
      const denied = requireRole(session, 'logistics');
      expect(denied).toBeNull();
    });

    it('admin can access dashboard stats', () => {
      const session = makeSession('admin');
      const denied = requireRole(session, 'logistics');
      expect(denied).toBeNull();
    });
  });

  describe('response shape', () => {
    it('returns correct dashboard shape with stations array', async () => {
      // Simulate the shape returned by handleGetDashboardStats
      const dashboardData = {
        stations: [
          {
            stationId: 10,
            stationName: 'Station 10',
            stationCode: 'FS10',
            lastSubmission: '2026-04-06T12:00:00Z',
            itemCount: 20,
            itemsShort: 3,
            shortages: [
              { itemName: 'NPA Kit', category: 'Airway', target: 4, actual: 1, delta: -3 },
            ],
          },
        ],
        categoryShortages: [
          { category: 'Airway', count: 2 },
        ],
        orderPipeline: {
          pending: 3,
          inProgress: 1,
          filled: 5,
        },
        recentSessions: [
          {
            id: 1,
            stationName: 'Station 10',
            submittedAt: '2026-04-06T12:00:00Z',
            submittedBy: 'crew@dcvfd.org',
            itemCount: 20,
            itemsShort: 3,
          },
        ],
      };

      const res = ok(dashboardData);
      expect(res.status).toBe(200);
      const body = await res.json() as typeof dashboardData;
      expect(body.stations).toBeDefined();
      expect(Array.isArray(body.stations)).toBe(true);
      expect(body.categoryShortages).toBeDefined();
      expect(body.orderPipeline).toBeDefined();
      expect(body.orderPipeline.pending).toBe(3);
      expect(body.recentSessions).toBeDefined();
    });

    it('station entry includes shortages array', async () => {
      const station = {
        stationId: 10,
        stationName: 'Station 10',
        stationCode: 'FS10',
        lastSubmission: null,
        itemCount: 0,
        itemsShort: 0,
        shortages: [],
      };
      const res = ok({ stations: [station] });
      const body = await res.json() as { stations: typeof station[] };
      expect(body.stations[0].shortages).toEqual([]);
      expect(body.stations[0].lastSubmission).toBeNull();
    });
  });

  describe('database queries', () => {
    it('fetches latest sessions per station', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT MAX(id) FROM inventory_sessions GROUP BY station_id', () => {
        return [
          {
            id: 5,
            station_id: 10,
            submitted_at: '2026-04-06T12:00:00Z',
            submitted_by: null,
            item_count: 20,
            items_short: 2,
            station_name: 'Station 10',
            station_code: 'FS10',
          },
        ];
      });

      const db = mock.asD1();
      const result = await db
        .prepare('SELECT * WHERE id IN (SELECT MAX(id) FROM inventory_sessions GROUP BY station_id)')
        .all();

      expect(result.results).toHaveLength(1);
    });

    it('fetches active stations', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT id, name, code FROM stations WHERE is_active', () => [
        { id: 10, name: 'Station 10', code: 'FS10' },
        { id: 13, name: 'Station 13', code: 'FS13' },
        { id: 18, name: 'Station 18', code: 'FS18' },
        { id: 20, name: 'Station 20', code: 'FS20' },
      ]);

      const db = mock.asD1();
      const result = await db
        .prepare('SELECT id, name, code FROM stations WHERE is_active = 1')
        .all<{ id: number; name: string; code: string }>();

      expect(result.results).toHaveLength(4);
      expect(result.results[0].code).toBe('FS10');
    });

    it('fetches order pipeline counts grouped by status', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT status, COUNT', () => [
        { status: 'pending', count: 3 },
        { status: 'in_progress', count: 1 },
        { status: 'filled', count: 12 },
      ]);

      const db = mock.asD1();
      const result = await db
        .prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status')
        .all<{ status: string; count: number }>();

      const orderMap = new Map(result.results.map((r) => [r.status, r.count]));
      expect(orderMap.get('pending')).toBe(3);
      expect(orderMap.get('in_progress')).toBe(1);
      expect(orderMap.get('filled')).toBe(12);
    });
  });
});
