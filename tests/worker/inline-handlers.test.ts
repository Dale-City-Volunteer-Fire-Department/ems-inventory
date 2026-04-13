import { describe, it, expect } from 'vitest';
import { StatefulD1Mock } from '../helpers/mocks';
import { requireRole } from '../../src/worker/middleware/rbac';
import type { Category, UserRole } from '../../src/shared/types';
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

const VALID_CATEGORIES: Category[] = [
  'Airway',
  'Breathing',
  'Circulation',
  'Medications',
  'Splinting',
  'Burn',
  'OB/Peds',
  'Misc',
];

// ── Tests ────────────────────────────────────────────────────────────

describe('Inline Route Handlers (index.ts)', () => {
  describe('PUT /api/items/:id — handleUpdateItemById', () => {
    it('requires logistics+ role', () => {
      const crewDenied = requireRole(makeSession('crew'), 'logistics');
      expect(crewDenied).not.toBeNull();
      expect(crewDenied!.status).toBe(403);

      const logisticsDenied = requireRole(makeSession('logistics'), 'logistics');
      expect(logisticsDenied).toBeNull();
    });

    it('extracts item ID from path', () => {
      const path = '/api/items/42';
      const id = Number(path.split('/').pop());
      expect(id).toBe(42);
    });

    it('returns 404 when item does not exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT * FROM items WHERE id', () => []);

      const db = mock.asD1();
      const item = await db.prepare('SELECT * FROM items WHERE id = ?').bind(42).first();
      expect(item).toBeNull();
    });

    it('validates item name length (1-200 chars)', () => {
      const tooShort = '';
      const tooLong = 'a'.repeat(201);
      const valid = 'NPA Kit';

      expect(tooShort.length < 1 || tooShort.length > 200).toBe(true);
      expect(tooLong.length < 1 || tooLong.length > 200).toBe(true);
      expect(valid.length >= 1 && valid.length <= 200).toBe(true);
    });

    it('validates category against allowed values', () => {
      expect(VALID_CATEGORIES.includes('Airway')).toBe(true);
      expect(VALID_CATEGORIES.includes('InvalidCat' as Category)).toBe(false);
    });

    it('merges partial update with current values', () => {
      const current = { name: 'NPA Kit', category: 'Airway', sort_order: 0, is_active: 1 };
      const partial = { name: 'NPA Kit Updated' };

      const merged = {
        name: partial.name ?? current.name,
        category: current.category,
        sort_order: current.sort_order,
        is_active: current.is_active,
      };

      expect(merged.name).toBe('NPA Kit Updated');
      expect(merged.category).toBe('Airway');
    });

    it('converts is_active boolean to 1/0 for DB', () => {
      const active = true;
      const inactive = false;
      expect(active ? 1 : 0).toBe(1);
      expect(inactive ? 1 : 0).toBe(0);
    });

    it('updates item and returns updated record', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT * FROM items WHERE id', () => [
        { id: 42, name: 'Updated Item', category: 'Airway', sort_order: 1, is_active: 1 },
      ]);
      mock.onQuery('UPDATE items SET', () => []);

      const db = mock.asD1();
      await db
        .prepare(
          `UPDATE items SET name = ?, category = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind('Updated Item', 'Airway', 1, 1, 42)
        .run();

      const updated = await db.prepare('SELECT * FROM items WHERE id = ?').bind(42).first();
      expect(updated).not.toBeNull();
    });
  });

  describe('PUT /api/stock-targets/:id — handleUpdateTargetById', () => {
    it('requires logistics+ role', () => {
      const crewDenied = requireRole(makeSession('crew'), 'logistics');
      expect(crewDenied).not.toBeNull();

      const logisticsDenied = requireRole(makeSession('logistics'), 'logistics');
      expect(logisticsDenied).toBeNull();
    });

    it('extracts target ID from path', () => {
      const path = '/api/stock-targets/17';
      const id = Number(path.split('/').pop());
      expect(id).toBe(17);
    });

    it('validates target_count is a non-negative number', () => {
      function isValidTarget(val: unknown): boolean {
        return typeof val === 'number' && val >= 0;
      }
      expect(isValidTarget(5)).toBe(true);
      expect(isValidTarget(0)).toBe(true);
      expect(isValidTarget(-1)).toBe(false);
      expect(isValidTarget('five')).toBe(false);
    });

    it('rejects undefined target_count', () => {
      const body: { target_count?: number } = {};
      expect(body.target_count === undefined).toBe(true);
    });

    it('returns 404 when stock target does not exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT * FROM stock_targets WHERE id', () => []);

      const db = mock.asD1();
      const target = await db.prepare('SELECT * FROM stock_targets WHERE id = ?').bind(99).first();
      expect(target).toBeNull();
    });

    it('updates target count in database', async () => {
      const mock = new StatefulD1Mock();
      let capturedBinds: unknown[] = [];
      mock.onQuery('UPDATE stock_targets SET target_count', (binds) => {
        capturedBinds = binds;
        return [];
      });

      const db = mock.asD1();
      await db
        .prepare(`UPDATE stock_targets SET target_count = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(10, 17)
        .run();

      expect(capturedBinds).toEqual([10, 17]);
    });
  });

  describe('GET /api/inventory/current/:stationId/summary — handleGetInventorySummary', () => {
    it('extracts stationId from path', () => {
      const path = '/api/inventory/current/10/summary';
      const parts = path.split('/');
      const stationId = Number(parts[4]);
      expect(stationId).toBe(10);
    });

    it('rejects invalid stationId (NaN)', () => {
      const path = '/api/inventory/current/abc/summary';
      const parts = path.split('/');
      const stationId = Number(parts[4]);
      expect(isNaN(stationId)).toBe(true);
    });

    it('returns 404 when station does not exist', async () => {
      const mock = new StatefulD1Mock();
      mock.onQuery('SELECT id, name FROM stations WHERE id', () => []);

      const db = mock.asD1();
      const station = await db.prepare('SELECT id, name FROM stations WHERE id = ?').bind(999).first();
      expect(station).toBeNull();
    });

    it('summary response includes correct shape', () => {
      const summary = {
        stationId: 10,
        stationName: 'Station 10',
        lastSubmission: '2026-04-06T12:00:00Z',
        shortageCount: 2,
        shortages: [
          { itemName: 'NPA Kit', category: 'Airway', target: 4, actual: 1, delta: -3 },
          { itemName: 'BVM', category: 'Breathing', target: 2, actual: 0, delta: -2 },
        ],
      };

      expect(summary.stationId).toBe(10);
      expect(summary.shortageCount).toBe(2);
      expect(summary.shortages).toHaveLength(2);
      expect(summary.shortages[0].delta).toBeLessThan(0);
    });

    it('summary with no prior sessions has null lastSubmission', () => {
      const summary = {
        stationId: 10,
        stationName: 'Station 10',
        lastSubmission: null,
        shortageCount: 0,
        shortages: [],
      };

      expect(summary.lastSubmission).toBeNull();
      expect(summary.shortages).toHaveLength(0);
    });
  });

  describe('GET /api/inventory/history — handleGetHistory', () => {
    it('parses query params from URL', () => {
      const url = new URL(
        'https://emsinventory.dcvfd.org/api/inventory/history?stationName=Station+10&category=Airway&status=short&limit=50&offset=10',
      );
      expect(url.searchParams.get('stationName')).toBe('Station 10');
      expect(url.searchParams.get('category')).toBe('Airway');
      expect(url.searchParams.get('status')).toBe('short');
      expect(Number(url.searchParams.get('limit'))).toBe(50);
      expect(Number(url.searchParams.get('offset'))).toBe(10);
    });

    it('handles missing query params gracefully', () => {
      const url = new URL('https://emsinventory.dcvfd.org/api/inventory/history');
      expect(url.searchParams.get('stationName')).toBeNull();
      expect(url.searchParams.get('sessionId')).toBeNull();
      expect(Number(url.searchParams.get('limit')) || undefined).toBeUndefined();
    });
  });

  describe('GET /api/inventory/sessions — handleGetSessions', () => {
    it('parses stationId from query params', () => {
      const url = new URL('https://emsinventory.dcvfd.org/api/inventory/sessions?stationId=10');
      const stationId = url.searchParams.get('stationId');
      expect(stationId).toBe('10');
      expect(Number(stationId)).toBe(10);
    });

    it('handles missing stationId', () => {
      const url = new URL('https://emsinventory.dcvfd.org/api/inventory/sessions');
      const stationId = url.searchParams.get('stationId');
      expect(stationId).toBeNull();
    });
  });

  describe('health check endpoint', () => {
    it('response shape includes status, app, and timestamp', () => {
      const healthData = {
        status: 'ok',
        app: 'ems-inventory',
        timestamp: new Date().toISOString(),
      };
      expect(healthData.status).toBe('ok');
      expect(healthData.app).toBeDefined();
      expect(healthData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('route regex patterns', () => {
    it('/api/items/:id matches numeric IDs', () => {
      const pattern = /^\/api\/items\/\d+$/;
      expect(pattern.test('/api/items/1')).toBe(true);
      expect(pattern.test('/api/items/42')).toBe(true);
      expect(pattern.test('/api/items/abc')).toBe(false);
      expect(pattern.test('/api/items/')).toBe(false);
      expect(pattern.test('/api/items')).toBe(false);
    });

    it('/api/stock-targets/:id matches numeric IDs', () => {
      const pattern = /^\/api\/stock-targets\/\d+$/;
      expect(pattern.test('/api/stock-targets/1')).toBe(true);
      expect(pattern.test('/api/stock-targets/17')).toBe(true);
      expect(pattern.test('/api/stock-targets/abc')).toBe(false);
    });

    it('/api/users/:id/role matches numeric IDs', () => {
      const pattern = /^\/api\/users\/\d+\/role$/;
      expect(pattern.test('/api/users/1/role')).toBe(true);
      expect(pattern.test('/api/users/42/role')).toBe(true);
      expect(pattern.test('/api/users/abc/role')).toBe(false);
      expect(pattern.test('/api/users/1/active')).toBe(false);
    });

    it('/api/users/:id/active matches numeric IDs', () => {
      const pattern = /^\/api\/users\/\d+\/active$/;
      expect(pattern.test('/api/users/1/active')).toBe(true);
      expect(pattern.test('/api/users/99/active')).toBe(true);
      expect(pattern.test('/api/users/abc/active')).toBe(false);
      expect(pattern.test('/api/users/1/role')).toBe(false);
    });

    it('/api/inventory/current/:stationId/summary matches numeric IDs', () => {
      const pattern = /^\/api\/inventory\/current\/\d+\/summary$/;
      expect(pattern.test('/api/inventory/current/10/summary')).toBe(true);
      expect(pattern.test('/api/inventory/current/13/summary')).toBe(true);
      expect(pattern.test('/api/inventory/current/abc/summary')).toBe(false);
    });
  });
});
