/**
 * API Contract Tests
 *
 * These tests call the REAL worker fetch handler and verify that
 * response shapes match what the frontend expects. They use mock
 * D1/KV but exercise the actual routing and handler code.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../../src/worker/index';
import { StatefulD1Mock, createMockKV, makeItem, makeTemplateItem } from '../helpers/mocks';
import { createSession } from '../../src/worker/auth/session';
import type { Env } from '../../src/worker/types';
import type { UserRole } from '../../src/shared/types';

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8787';

let mockDb: StatefulD1Mock;
let mockKv: KVNamespace;
let mockEnv: Env;

/** Build a mock ASSETS Fetcher that returns 404 for everything */
function createMockAssets(): Fetcher {
  return {
    fetch: async () => new Response('Not Found', { status: 404 }),
  } as unknown as Fetcher;
}

function buildMockEnv(db: StatefulD1Mock, kv: KVNamespace): Env {
  return {
    DB: db.asD1(),
    SESSIONS: kv,
    ASSETS: createMockAssets(),
    APP_NAME: 'ems-inventory-test',
    ORG_NAME: 'DCVFD',
    AZURE_AD_CLIENT_ID: 'test-client-id',
    AZURE_AD_TENANT_ID: 'test-tenant-id',
    AZURE_AD_CLIENT_SECRET: 'test-client-secret',
    STATION_PIN: '5214',
  };
}

const mockCtx = {} as ExecutionContext;

/** Call the worker with no auth */
async function callWorker(method: string, path: string, body?: unknown): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: { Origin: 'http://localhost:8787' },
  };
  if (body) {
    opts.body = JSON.stringify(body);
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  return worker.fetch(new Request(`${BASE_URL}${path}`, opts), mockEnv, mockCtx);
}

/** Call the worker with a valid session cookie for an admin user */
async function callWorkerAuth(
  method: string,
  path: string,
  body?: unknown,
  role: UserRole = 'admin',
): Promise<Response> {
  // Create a real session in mock KV
  const { sessionId } = await createSession(
    { SESSIONS: mockKv } as Env,
    {
      userId: 1,
      email: 'admin@dcvfd.org',
      name: 'Test Admin',
      role,
      stationId: null,
      authMethod: 'entra_sso',
    },
  );

  // The auth middleware checks user is_active in the DB
  mockDb.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

  const headers: Record<string, string> = {
    Cookie: `ems_session=${sessionId}`,
    Origin: 'http://localhost:8787',
  };
  const opts: RequestInit = { method, headers };
  if (body) {
    opts.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  return worker.fetch(new Request(`${BASE_URL}${path}`, opts), mockEnv, mockCtx);
}

// ── Seed helpers ────────────────────────────────────────────────────

function seedStations() {
  mockDb.onQuery('SELECT * FROM stations WHERE is_active', () => [
    { id: 10, name: 'Station 10', code: 'FS10', is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 13, name: 'Station 13', code: 'FS13', is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
  ]);
}

function seedItems() {
  mockDb.onQuery('WHERE is_active = 1 ORDER BY category', () => [
    makeItem({ id: 1, name: 'NPA Kit', category: 'Airway' }),
    makeItem({ id: 2, name: 'BVM Adult', category: 'Breathing' }),
  ]);
}

function seedStockTargets() {
  mockDb.onQuery('FROM stock_targets st JOIN items i', () => [
    { id: 1, item_id: 1, station_id: 10, target_count: 4, item_name: 'NPA Kit', category: 'Airway', created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 2, item_id: 2, station_id: 10, target_count: 2, item_name: 'BVM Adult', category: 'Breathing', created_at: '2026-01-01', updated_at: '2026-01-01' },
  ]);
}

function seedInventoryTemplate() {
  mockDb.onQuery('FROM items i', () => [
    makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 }),
    makeTemplateItem({ item_id: 2, item_name: 'BVM Adult', category: 'Breathing', target_count: 2 }),
  ]);
}

function seedOrders() {
  mockDb.onQuery('FROM orders', () => [
    { id: 1, session_id: 1, station_id: 10, status: 'pending', items_json: '[]', created_at: '2026-01-01', updated_at: '2026-01-01', filled_by: null, filled_at: null },
  ]);
}

function seedUsers() {
  // For the GET /api/users query (includes JOIN)
  mockDb.onQuery('SELECT u.id, u.email, u.name, u.role', (binds) => {
    // Differentiate between the user-list query and the single-user query
    return [
      { id: 1, email: 'admin@dcvfd.org', name: 'Admin User', role: 'admin', station_id: null, auth_method: 'entra_sso', is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, station_name: null },
      { id: 2, email: 'crew@dcvfd.org', name: 'Crew Member', role: 'crew', station_id: 10, auth_method: 'pin', is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, station_name: 'Station 10' },
    ];
  });
}

function seedSessions() {
  mockDb.onQuery('FROM inventory_sessions', () => [
    { id: 1, station_id: 10, submitted_at: '2026-04-01T12:00:00Z', submitted_by: 'crew@dcvfd.org', item_count: 10, items_short: 2 },
  ]);
}

function seedHistory() {
  mockDb.onQuery('FROM inventory_history', () => [
    { id: 1, session_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4, actual_count: 2, delta: -2, status: 'short', station_name: 'Station 10' },
  ]);
}

function seedDashboard() {
  // Latest sessions per station (for the subquery)
  mockDb.onQuery('SELECT MAX(id) FROM inventory_sessions GROUP BY station_id', () => [{ 'MAX(id)': 1 }]);

  // Latest sessions joined with stations
  mockDb.onQuery('FROM inventory_sessions s\n         JOIN stations st', () => [
    { id: 1, station_id: 10, submitted_at: '2026-04-01T12:00:00Z', submitted_by: 'crew@dcvfd.org', item_count: 10, items_short: 2, station_name: 'Station 10', station_code: 'FS10' },
  ]);

  // Shortage items
  mockDb.onQuery('FROM inventory_history h\n           JOIN inventory_sessions s', () => [
    { session_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4, actual_count: 2, delta: -2, station_id: 10 },
  ]);

  // Category shortages
  mockDb.onQuery('SELECT category, COUNT', () => [
    { category: 'Airway', count: 1 },
  ]);

  // All active stations
  mockDb.onQuery('SELECT id, name, code FROM stations WHERE is_active', () => [
    { id: 10, name: 'Station 10', code: 'FS10' },
    { id: 13, name: 'Station 13', code: 'FS13' },
  ]);

  // Order pipeline
  mockDb.onQuery('SELECT status, COUNT', () => [
    { status: 'pending', count: 3 },
    { status: 'in_progress', count: 1 },
  ]);

  // Recent sessions
  mockDb.onQuery('ORDER BY s.submitted_at DESC', () => [
    { id: 1, submitted_at: '2026-04-01T12:00:00Z', submitted_by: 'crew@dcvfd.org', item_count: 10, items_short: 2, station_name: 'Station 10' },
  ]);
}

// ── Contract Tests ──────────────────────────────────────────────────

describe('API Contract Tests', () => {
  beforeEach(() => {
    mockDb = new StatefulD1Mock();
    mockKv = createMockKV();
    mockEnv = buildMockEnv(mockDb, mockKv);
  });

  // ── Public endpoints (no auth needed) ─────────────────────────────

  describe('GET /api/health', () => {
    it('returns { status, app, timestamp }', async () => {
      const res = await callWorker('GET', '/api/health');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('app', 'ems-inventory-test');
      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('string');
    });
  });

  describe('GET /api/stations', () => {
    it('returns { stations: Station[] }', async () => {
      seedStations();
      const res = await callWorker('GET', '/api/stations');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      // Must be wrapped in { stations: [...] }, NOT a flat array
      expect(body).not.toBeInstanceOf(Array);
      expect(body).toHaveProperty('stations');
      expect(Array.isArray(body.stations)).toBe(true);
      const stations = body.stations as Record<string, unknown>[];
      expect(stations.length).toBeGreaterThan(0);
      expect(stations[0]).toHaveProperty('id');
      expect(stations[0]).toHaveProperty('name');
    });
  });

  describe('GET /api/items', () => {
    it('returns { items: Item[], count: number }', async () => {
      seedItems();
      const res = await callWorker('GET', '/api/items');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.count).toBe('number');
      const items = body.items as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('name');
      expect(items[0]).toHaveProperty('category');
    });
  });

  describe('GET /api/stock-targets', () => {
    it('returns { stationId, targets: StockTarget[], count }', async () => {
      seedStockTargets();
      const res = await callWorker('GET', '/api/stock-targets?stationId=10');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('stationId', 10);
      expect(body).toHaveProperty('targets');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.targets)).toBe(true);
      expect(typeof body.count).toBe('number');
    });

    it('returns 400 when stationId is missing', async () => {
      const res = await callWorker('GET', '/api/stock-targets');
      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
    });
  });

  describe('GET /api/inventory/current/:stationId', () => {
    it('returns a flat array (NOT wrapped)', async () => {
      seedInventoryTemplate();
      const res = await callWorker('GET', '/api/inventory/current/10');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>[];
      // Must be a flat array, not wrapped in an object
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      // Verify item shape
      expect(body[0]).toHaveProperty('item_id');
      expect(body[0]).toHaveProperty('name');
      expect(body[0]).toHaveProperty('category');
      expect(body[0]).toHaveProperty('target_count');
      expect(body[0]).toHaveProperty('station_id');
      expect(body[0]).toHaveProperty('actual_count');
      expect(body[0]).toHaveProperty('status');
      expect(body[0]).toHaveProperty('sort_order');
    });
  });

  // ── Auth-required endpoints ───────────────────────────────────────

  describe('GET /api/orders', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/orders');
      expect(res.status).toBe(401);
    });

    it('returns { orders: Order[], count }', async () => {
      seedOrders();
      const res = await callWorkerAuth('GET', '/api/orders', undefined, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('orders');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.orders)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });

  describe('GET /api/users', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/users');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin role', async () => {
      const res = await callWorkerAuth('GET', '/api/users', undefined, 'crew');
      expect(res.status).toBe(403);
    });

    it('returns { users: UserRecord[], count }', async () => {
      seedUsers();
      const res = await callWorkerAuth('GET', '/api/users', undefined, 'admin');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('users');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.users)).toBe(true);
      expect(typeof body.count).toBe('number');
      const users = body.users as Record<string, unknown>[];
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('id');
      expect(users[0]).toHaveProperty('name');
      expect(users[0]).toHaveProperty('role');
      expect(users[0]).toHaveProperty('is_active');
      expect(typeof users[0].is_active).toBe('boolean');
    });
  });

  describe('GET /api/inventory/sessions', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/inventory/sessions');
      expect(res.status).toBe(401);
    });

    it('returns { sessions: [...], count }', async () => {
      seedSessions();
      const res = await callWorkerAuth('GET', '/api/inventory/sessions', undefined, 'crew');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('sessions');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });

  describe('GET /api/inventory/history', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/inventory/history');
      expect(res.status).toBe(401);
    });

    it('returns { history: [...], count }', async () => {
      seedHistory();
      const res = await callWorkerAuth('GET', '/api/inventory/history', undefined, 'crew');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('history');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.history)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });

  describe('GET /api/dashboard/stats', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('returns 403 for crew role', async () => {
      const res = await callWorkerAuth('GET', '/api/dashboard/stats', undefined, 'crew');
      expect(res.status).toBe(403);
    });

    it('returns { stations, categoryShortages, orderPipeline, recentSessions }', async () => {
      seedDashboard();
      const res = await callWorkerAuth('GET', '/api/dashboard/stats', undefined, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('stations');
      expect(body).toHaveProperty('categoryShortages');
      expect(body).toHaveProperty('orderPipeline');
      expect(body).toHaveProperty('recentSessions');
      expect(Array.isArray(body.stations)).toBe(true);
      expect(Array.isArray(body.categoryShortages)).toBe(true);
      expect(Array.isArray(body.recentSessions)).toBe(true);
      // orderPipeline is an object
      const pipeline = body.orderPipeline as Record<string, unknown>;
      expect(pipeline).toHaveProperty('pending');
      expect(pipeline).toHaveProperty('inProgress');
      expect(pipeline).toHaveProperty('filled');
      expect(typeof pipeline.pending).toBe('number');
    });
  });

  describe('GET /api/inventory/current/:id/summary', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('GET', '/api/inventory/current/10/summary');
      expect(res.status).toBe(401);
    });

    it('returns { stationId, stationName, lastSubmission, shortageCount, shortages }', async () => {
      // Seed station lookup
      mockDb.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);
      // Seed last session
      mockDb.onQuery('FROM inventory_sessions WHERE station_id', () => [
        { id: 1, submitted_at: '2026-04-01T12:00:00Z', items_short: 2 },
      ]);
      // Seed shortages from that session
      mockDb.onQuery('FROM inventory_history WHERE session_id', () => [
        { item_name: 'NPA Kit', category: 'Airway', target_count: 4, actual_count: 2, delta: -2 },
      ]);

      const res = await callWorkerAuth('GET', '/api/inventory/current/10/summary', undefined, 'crew');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('stationId', 10);
      expect(body).toHaveProperty('stationName', 'Station 10');
      expect(body).toHaveProperty('lastSubmission');
      expect(body).toHaveProperty('shortageCount');
      expect(body).toHaveProperty('shortages');
      expect(Array.isArray(body.shortages)).toBe(true);
      expect(typeof body.shortageCount).toBe('number');
    });
  });

  describe('POST /api/inventory/submit', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('POST', '/api/inventory/submit', {
        stationId: 10,
        counts: [{ itemId: 1, actualCount: 4 }],
      });
      expect(res.status).toBe(401);
    });

    it('returns { sessionId, itemCount, itemsShort, orderId, message }', async () => {
      // Seed: station lookup, template items, session insert, history insert, order insert
      mockDb.onQuery('SELECT name FROM stations WHERE id', () => [{ name: 'Station 10' }]);
      mockDb.onQuery('FROM items i', () => [
        makeTemplateItem({ item_id: 1, item_name: 'NPA Kit', category: 'Airway', target_count: 4 }),
        makeTemplateItem({ item_id: 2, item_name: 'BVM Adult', category: 'Breathing', target_count: 2 }),
      ]);
      mockDb.onQuery('INSERT INTO inventory_sessions', () => []);
      mockDb.onQuery('INSERT INTO inventory_history', () => []);
      mockDb.onQuery('INSERT INTO orders', () => []);

      const res = await callWorkerAuth('POST', '/api/inventory/submit', {
        stationId: 10,
        counts: [
          { itemId: 1, actualCount: 2 },
          { itemId: 2, actualCount: 1 },
        ],
      }, 'crew');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('itemCount');
      expect(body).toHaveProperty('itemsShort');
      expect(body).toHaveProperty('orderId');
      expect(body).toHaveProperty('message');
      expect(typeof body.sessionId).toBe('number');
      expect(typeof body.itemCount).toBe('number');
      expect(typeof body.itemsShort).toBe('number');
      expect(typeof body.message).toBe('string');
    });
  });

  describe('PUT /api/items/:id', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('PUT', '/api/items/1', { name: 'Updated' });
      expect(res.status).toBe(401);
    });

    it('returns { item: Item }', async () => {
      const existingItem = makeItem({ id: 1, name: 'NPA Kit', category: 'Airway' });
      mockDb.onQuery('SELECT * FROM items WHERE id', () => [existingItem]);
      mockDb.onQuery('UPDATE items SET', () => []);

      const res = await callWorkerAuth('PUT', '/api/items/1', {
        name: 'NPA Kit Updated',
        category: 'Airway',
      }, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('item');
      const item = body.item as Record<string, unknown>;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('category');
    });
  });

  describe('POST /api/items', () => {
    it('returns { item: Item }', async () => {
      const newItem = makeItem({ id: 5, name: 'Cervical Collar', category: 'Splinting' });
      mockDb.onQuery('INSERT INTO items', () => []);
      mockDb.onQuery('SELECT * FROM items WHERE id', () => [newItem]);

      const res = await callWorkerAuth('POST', '/api/items', {
        name: 'Cervical Collar',
        category: 'Splinting',
        sort_order: 10,
      }, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('item');
      const item = body.item as Record<string, unknown>;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('category');
    });
  });

  describe('PUT /api/stock-targets', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('PUT', '/api/stock-targets', {
        itemId: 1, stationId: 10, targetCount: 5,
      });
      expect(res.status).toBe(401);
    });

    it('returns { itemId, stationId, targetCount }', async () => {
      mockDb.onQuery('INSERT OR REPLACE INTO stock_targets', () => []);

      const res = await callWorkerAuth('PUT', '/api/stock-targets', {
        itemId: 1,
        stationId: 10,
        targetCount: 5,
      }, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('itemId', 1);
      expect(body).toHaveProperty('stationId', 10);
      expect(body).toHaveProperty('targetCount', 5);
    });
  });

  describe('PUT /api/orders', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('PUT', '/api/orders', {
        orderId: 1, status: 'in_progress',
      });
      expect(res.status).toBe(401);
    });

    it('returns { orderId, status }', async () => {
      // The handler first checks the current order status for transition validation
      mockDb.onQuery('SELECT id, status FROM orders WHERE id', () => [{ id: 1, status: 'pending' }]);
      mockDb.onQuery('UPDATE orders SET', () => []);

      const res = await callWorkerAuth('PUT', '/api/orders', {
        orderId: 1,
        status: 'in_progress',
      }, 'logistics');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('orderId', 1);
      expect(body).toHaveProperty('status', 'in_progress');
    });
  });

  describe('PUT /api/users/:id/role', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('PUT', '/api/users/2/role', { role: 'logistics' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin', async () => {
      const res = await callWorkerAuth('PUT', '/api/users/2/role', { role: 'logistics' }, 'logistics');
      expect(res.status).toBe(403);
    });

    it('returns { user: UserRecord }', async () => {
      // Seed: check user exists, then return updated user
      mockDb.onQuery('SELECT id FROM users WHERE id', () => [{ id: 2 }]);
      mockDb.onQuery('UPDATE users SET role', () => []);
      mockDb.onQuery('SELECT u.id, u.email, u.name, u.role', () => [
        { id: 2, email: 'crew@dcvfd.org', name: 'Crew Member', role: 'logistics', station_id: 10, auth_method: 'pin', is_active: 1, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, station_name: 'Station 10' },
      ]);

      const res = await callWorkerAuth('PUT', '/api/users/2/role', { role: 'logistics' }, 'admin');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('user');
      const user = body.user as Record<string, unknown>;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('is_active');
      // is_active should be converted from number to boolean
      expect(typeof user.is_active).toBe('boolean');
    });
  });

  describe('PUT /api/users/:id/active', () => {
    it('returns 401 without auth', async () => {
      const res = await callWorker('PUT', '/api/users/2/active', { is_active: false });
      expect(res.status).toBe(401);
    });

    it('returns { user: UserRecord }', async () => {
      mockDb.onQuery('SELECT id FROM users WHERE id', () => [{ id: 2 }]);
      mockDb.onQuery('UPDATE users SET is_active', () => []);
      mockDb.onQuery('SELECT u.id, u.email, u.name, u.role', () => [
        { id: 2, email: 'crew@dcvfd.org', name: 'Crew Member', role: 'crew', station_id: 10, auth_method: 'pin', is_active: 0, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, station_name: 'Station 10' },
      ]);

      const res = await callWorkerAuth('PUT', '/api/users/2/active', { is_active: false }, 'admin');
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('user');
      const user = body.user as Record<string, unknown>;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('is_active');
      expect(typeof user.is_active).toBe('boolean');
      expect(user.is_active).toBe(false);
    });
  });

  // ── Error shape contract ──────────────────────────────────────────

  describe('Error responses', () => {
    it('404 returns { error: string }', async () => {
      const res = await callWorker('GET', '/api/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('401 returns { error: string }', async () => {
      const res = await callWorker('GET', '/api/orders');
      expect(res.status).toBe(401);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('400 returns { error: string }', async () => {
      const res = await callWorker('GET', '/api/stock-targets');
      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });
  });
});
