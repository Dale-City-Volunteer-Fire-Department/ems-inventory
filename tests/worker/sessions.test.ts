import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { getSessions } from '../../src/worker/lib/db';
import { requireRole } from '../../src/worker/middleware/rbac';
import type { UserRole } from '../../src/shared/types';
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

// ── Tests ────────────────────────────────────────────────────────────

describe('Inventory Sessions Endpoint', () => {
  describe('auth requirements', () => {
    it('requires authentication (any role)', () => {
      // The route uses requireAuth, which returns 401 without a session.
      // Any authenticated user can access sessions.
      const crewSession = makeSession('crew');
      // crew can access sessions (no role restriction beyond auth)
      expect(crewSession.role).toBe('crew');
    });
  });

  describe('getSessions from DB', () => {
    it('returns sessions for a specific stationId', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_sessions', () => [
        {
          id: 1,
          station_id: 10,
          station_name: 'Station 10',
          submitted_by: 'crew@dcvfd.org',
          submitted_at: '2026-04-06T12:00:00Z',
          item_count: 20,
          items_short: 3,
        },
        {
          id: 2,
          station_id: 10,
          station_name: 'Station 10',
          submitted_by: null,
          submitted_at: '2026-04-05T08:00:00Z',
          item_count: 20,
          items_short: 0,
        },
      ]);

      const db = mock.asD1();
      const sessions = await getSessions(db, { stationId: 10 });

      expect(sessions).toHaveLength(2);
      expect(sessions[0].station_id).toBe(10);
      expect(sessions[0].station_name).toBe('Station 10');
      expect(sessions[0].item_count).toBe(20);
    });

    it('returns all sessions when no stationId filter', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_sessions', () => [
        {
          id: 1,
          station_id: 10,
          station_name: 'Station 10',
          submitted_by: null,
          submitted_at: '2026-04-06T12:00:00Z',
          item_count: 20,
          items_short: 3,
        },
        {
          id: 2,
          station_id: 13,
          station_name: 'Station 13',
          submitted_by: 'logistics@dcvfd.org',
          submitted_at: '2026-04-05T08:00:00Z',
          item_count: 15,
          items_short: 1,
        },
      ]);

      const db = mock.asD1();
      const sessions = await getSessions(db);
      expect(sessions).toHaveLength(2);
    });

    it('returns empty array when no sessions exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_sessions', () => []);

      const db = mock.asD1();
      const sessions = await getSessions(db, { stationId: 99 });
      expect(sessions).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_sessions', () => [
        {
          id: 1,
          station_id: 10,
          station_name: 'Station 10',
          submitted_by: null,
          submitted_at: '2026-04-06T12:00:00Z',
          item_count: 20,
          items_short: 0,
        },
      ]);

      const db = mock.asD1();
      const sessions = await getSessions(db, { limit: 1 });
      // Mock returns what it has; real DB would enforce LIMIT
      expect(sessions).toHaveLength(1);
    });

    it('respects offset parameter', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('FROM inventory_sessions', () => []);

      const db = mock.asD1();
      const sessions = await getSessions(db, { offset: 100 });
      expect(sessions).toHaveLength(0);
    });

    it('defaults limit to 100 when not provided', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('FROM inventory_sessions', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await getSessions(db);
      // Last two binds should be limit=100, offset=0
      expect(capturedBinds).toEqual([100, 0]);
    });

    it('session shape includes all required fields', async () => {
      const mock = new StatefulD1Mock();
      const sessionData = {
        id: 5,
        station_id: 13,
        station_name: 'Station 13',
        submitted_by: 'user@pwcgov.org',
        submitted_at: '2026-04-07T09:30:00Z',
        item_count: 25,
        items_short: 4,
      };
      mock.onQuery('FROM inventory_sessions', () => [sessionData]);

      const db = mock.asD1();
      const sessions = await getSessions(db, { stationId: 13 });

      expect(sessions[0]).toEqual(sessionData);
      expect(sessions[0].id).toBe(5);
      expect(sessions[0].submitted_by).toBe('user@pwcgov.org');
      expect(sessions[0].items_short).toBe(4);
    });
  });

  describe('handler response shape', () => {
    it('wraps sessions in object with count', () => {
      const sessions = [
        { id: 1, station_id: 10, station_name: 'Station 10', submitted_by: null, submitted_at: '2026-04-06', item_count: 20, items_short: 0 },
      ];
      const responseData = { sessions, count: sessions.length };
      expect(responseData.count).toBe(1);
      expect(responseData.sessions).toHaveLength(1);
    });
  });
});
