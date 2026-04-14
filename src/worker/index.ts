import { Env } from './types';
import { handleCorsPreflightRequest, addCorsHeaders } from './middleware/cors';
import { handleGetTemplate, handleSubmitInventory } from './inventory';
import { handleGetItems, handleUpdateItem } from './items';
import { handleGetStations } from './stations';
import { handleGetOrders, handleUpdateOrder } from './orders';
import { handleGetTargets, handleUpdateTarget } from './stock-targets';
import { getHistory, getSessions } from './lib/db';
import { ok, badRequest, notFound, forbidden, serverError } from './lib/response';
import type { Category } from '../shared/types';
import { handleEntraLogin, handleEntraCallback } from './auth/entra';
import { handlePinAuth } from './auth/pin';
import { handleAuthMe, handleAuthLogout } from './auth/handlers';
import { requireAuth } from './middleware/auth';
import { handlePublicVerifyPin, handlePublicUpload, handlePublicInventorySubmit, handlePublicGetInventory } from './public';
import type { Session } from './middleware/auth';
import { requireRole } from './middleware/rbac';
import type { UserRole } from '../shared/types';
import type {
  HealthResponse,
  InventorySessionsResponse,
  InventoryHistoryResponse,
  UsersResponse,
  UserResponse,
  ItemResponse,
  DashboardStatsResponse,
} from '@shared/api-responses';

// ── CSRF Origin verification ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://emsinventory.dcvfd.org',
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
];

// Auth callback routes that are GET-based redirects and don't need CSRF,
// plus public endpoints that use X-Public-Token for verification
const CSRF_EXEMPT_PATHS = [
  '/api/auth/entra/callback',
  '/api/public/verify-pin',
  '/api/public/upload',
  '/api/public/inventory/submit',
];

export function verifyCsrfOrigin(request: Request): Response | null {
  const method = request.method;
  // Only check mutating methods
  if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE' && method !== 'PATCH') {
    return null;
  }

  const url = new URL(request.url);
  // Only check /api/ routes
  if (!url.pathname.startsWith('/api/')) {
    return null;
  }

  // Exempt auth callback routes
  if (CSRF_EXEMPT_PATHS.includes(url.pathname)) {
    return null;
  }

  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return forbidden('Invalid or missing Origin header');
  }

  return null;
}

// ── Valid categories for item validation ─────────────────────────────
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

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    const corsResponse = handleCorsPreflightRequest(request);
    if (corsResponse) return corsResponse;

    // MEDIUM-5: CSRF — verify Origin header on mutating requests to /api/ routes
    const csrfResult = verifyCsrfOrigin(request);
    if (csrfResult) return addCorsHeaders(request, csrfResult);

    // Route the request and add CORS headers to the response
    const response = await routeRequest(request, env);
    return addCorsHeaders(request, response);
  },
};

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ── Health check (public) ─────────────────────────────────────────
  if (path === '/api/health' && method === 'GET') {
    return ok<HealthResponse>({ status: 'ok', app: env.APP_NAME, timestamp: new Date().toISOString() });
  }

  // ── Auth routes ───────────────────────────────────────────────────
  // Entra ID SSO
  if (path === '/api/auth/entra/login' && method === 'GET') {
    return handleEntraLogin(request, env);
  }
  if (path === '/api/auth/entra/callback' && method === 'GET') {
    return handleEntraCallback(request, env);
  }
  // Station PIN
  if (path === '/api/auth/pin' && method === 'POST') {
    return handlePinAuth(request, env);
  }
  // Session management
  if (path === '/api/auth/me' && method === 'GET') {
    return handleAuthMe(request, env);
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return handleAuthLogout(request, env);
  }

  // ── Public inventory submission (PIN-gated) ───────────────────────
  if (path === '/api/public/verify-pin' && method === 'POST') {
    return handlePublicVerifyPin(request, env);
  }
  if (path === '/api/public/upload' && method === 'POST') {
    return handlePublicUpload(request, env);
  }
  if (path === '/api/public/inventory/submit' && method === 'POST') {
    return handlePublicInventorySubmit(request, env);
  }
  // GET /api/public/inventory/:stationId — token-gated inventory template for public form
  if (/^\/api\/public\/inventory\/\d+$/.test(path) && method === 'GET') {
    return handlePublicGetInventory(request, env);
  }

  // ── Dashboard stats (logistics+) ──────────────────────────────────
  if (path === '/api/dashboard/stats' && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleGetDashboardStats(env);
  }

  // ── Stations ──────────────────────────────────────────────────────
  if (path === '/api/stations' && method === 'GET') {
    return handleGetStations(request, env);
  }

  // ── Items ─────────────────────────────────────────────────────────
  if (path === '/api/items' && method === 'GET') {
    return handleGetItems(request, env);
  }
  if ((path === '/api/items' && method === 'PUT') || (path === '/api/items' && method === 'POST')) {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleUpdateItem(request, env);
  }
  // PUT /api/items/:id — update a single item by ID
  if (/^\/api\/items\/\d+$/.test(path) && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleUpdateItemById(request, env, path);
  }

  // ── Stock Targets (PAR levels) ────────────────────────────────────
  if (path === '/api/stock-targets' && method === 'GET') {
    return handleGetTargets(request, env);
  }
  if (path === '/api/stock-targets' && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleUpdateTarget(request, env);
  }
  // PUT /api/stock-targets/:id — update a single stock target by ID
  if (/^\/api\/stock-targets\/\d+$/.test(path) && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleUpdateTargetById(request, env, path);
  }

  // ── Inventory ─────────────────────────────────────────────────────
  // GET /api/inventory/sessions — list completed inventory sessions (requires auth)
  if (path === '/api/inventory/sessions' && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    return handleGetSessions(request, env);
  }
  // GET /api/inventory/current/:stationId/summary — dashboard summary (requires auth)
  if (/^\/api\/inventory\/current\/\d+\/summary$/.test(path) && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    return handleGetInventorySummary(request, env, path);
  }
  // GET /api/inventory/current/:stationId — public (template for form before PIN auth)
  if (path.startsWith('/api/inventory/current/') && method === 'GET') {
    return handleGetTemplate(request, env);
  }
  // POST /api/inventory/submit — requires auth (any role)
  if (path === '/api/inventory/submit' && method === 'POST') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    return handleSubmitInventory(request, env);
  }
  // GET /api/inventory/history — requires auth (any role)
  if (path === '/api/inventory/history' && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    return handleGetHistory(request, env);
  }

  // ── Orders ────────────────────────────────────────────────────────
  if (path === '/api/orders' && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleGetOrders(request, env);
  }
  if (path === '/api/orders' && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'logistics');
    if (denied) return denied;
    return handleUpdateOrder(request, env);
  }

  // ── Users (admin only) ────────────────────────────────────────────
  if (path === '/api/users' && method === 'GET') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'admin');
    if (denied) return denied;
    return handleGetUsers(request, env);
  }
  if (/^\/api\/users\/\d+\/role$/.test(path) && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'admin');
    if (denied) return denied;
    return handleUpdateUserRole(request, env, path, session);
  }
  if (/^\/api\/users\/\d+\/active$/.test(path) && method === 'PUT') {
    const session = await requireAuth(request, env);
    if (session instanceof Response) return session;
    const denied = requireRole(session, 'admin');
    if (denied) return denied;
    return handleUpdateUserActive(request, env, path, session);
  }

  // ── Static / fallback ─────────────────────────────────────────────
  if (!path.startsWith('/api/')) {
    // Serve static assets; fall back to index.html for SPA client-side routing
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
    // Serve index.html for any unmatched path (SPA routing)
    const spaUrl = new URL('/', request.url);
    return env.ASSETS.fetch(new Request(spaUrl, request));
  }

  return notFound('Route not found');
}

/**
 * PUT /api/items/:id — update a single item by ID (for admin panel)
 */
async function handleUpdateItemById(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const id = Number(path.split('/').pop());
    const body = await request.json<Record<string, unknown>>();
    // Fetch current item, merge with partial update
    const current = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!current) return notFound(`Item ${id} not found`);

    const name = (body.name as string) ?? (current.name as string);
    const category = (body.category as string) ?? (current.category as string);
    const sort_order = body.sort_order !== undefined ? body.sort_order : current.sort_order;
    const is_active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : current.is_active;

    // MEDIUM-2: Validate name length (1-200 chars)
    if (typeof name !== 'string' || name.length < 1 || name.length > 200) {
      return badRequest('Item name must be between 1 and 200 characters');
    }

    // MEDIUM-2: Validate category against allowed values
    if (!VALID_CATEGORIES.includes(category as Category)) {
      return badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    await env.DB.prepare(
      `UPDATE items SET name = ?, category = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(name, category, sort_order, is_active, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    return ok<ItemResponse>({ item: updated as unknown as ItemResponse['item'] });
  } catch (err) {
    console.error('[updateItemById]', err);
    return serverError('Failed to update item');
  }
}

/**
 * PUT /api/stock-targets/:id — update a single stock target by ID (for admin panel)
 */
async function handleUpdateTargetById(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const id = Number(path.split('/').pop());
    const body = await request.json<{ target_count?: number }>();

    if (body.target_count === undefined || typeof body.target_count !== 'number' || body.target_count < 0) {
      return badRequest('target_count must be a non-negative number');
    }

    const current = await env.DB.prepare('SELECT * FROM stock_targets WHERE id = ?').bind(id).first();
    if (!current) return notFound(`Stock target ${id} not found`);

    await env.DB.prepare(`UPDATE stock_targets SET target_count = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.target_count, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM stock_targets WHERE id = ?').bind(id).first();
    return ok({ target: updated });
  } catch (err) {
    console.error('[updateTargetById]', err);
    return serverError('Failed to update stock target');
  }
}

/**
 * GET /api/inventory/current/:stationId/summary — dashboard summary
 * Returns last submission info and current shortages for a station.
 */
async function handleGetInventorySummary(_request: Request, env: Env, path: string): Promise<Response> {
  try {
    const parts = path.split('/');
    const stationId = Number(parts[4]);
    if (!stationId || isNaN(stationId)) return badRequest('Invalid station ID');

    const station = await env.DB.prepare('SELECT id, name FROM stations WHERE id = ?')
      .bind(stationId)
      .first<{ id: number; name: string }>();
    if (!station) return notFound(`Station ${stationId} not found`);

    // Get the most recent session for this station
    const lastSession = await env.DB.prepare(
      'SELECT id, submitted_at, items_short FROM inventory_sessions WHERE station_id = ? ORDER BY submitted_at DESC LIMIT 1',
    )
      .bind(stationId)
      .first<{ id: number; submitted_at: string; items_short: number }>();

    // Get shortages from the most recent session
    let shortages: { itemName: string; category: string; target: number; actual: number; delta: number }[] = [];
    if (lastSession) {
      const rows = await env.DB.prepare(
        'SELECT item_name, category, target_count, actual_count, delta FROM inventory_history WHERE session_id = ? AND status = ? ORDER BY delta ASC',
      )
        .bind(lastSession.id, 'short')
        .all<{ item_name: string; category: string; target_count: number; actual_count: number; delta: number }>();

      shortages = rows.results.map((r) => ({
        itemName: r.item_name,
        category: r.category as string,
        target: r.target_count,
        actual: r.actual_count,
        delta: r.delta,
      }));
    }

    return ok({
      stationId: station.id,
      stationName: station.name,
      lastSubmission: lastSession?.submitted_at ?? null,
      shortageCount: shortages.length,
      shortages,
    });
  } catch (err) {
    console.error('[getInventorySummary]', err);
    return serverError('Failed to get inventory summary');
  }
}

/**
 * GET /api/inventory/history
 * Query params: ?stationName=Station+10&sessionId=1&category=Airway&status=short&limit=100&offset=0
 */
async function handleGetHistory(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stationName = url.searchParams.get('stationName') ?? undefined;
    const sessionIdStr = url.searchParams.get('sessionId');
    const category = url.searchParams.get('category') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Number(url.searchParams.get('limit')) || undefined;
    const offset = Number(url.searchParams.get('offset')) || undefined;

    const history = await getHistory(env.DB, {
      stationName,
      sessionId: sessionIdStr ? Number(sessionIdStr) : undefined,
      category,
      status,
      limit,
      offset,
    });

    return ok<InventoryHistoryResponse>({ history, count: history.length });
  } catch (err) {
    console.error('[getHistory]', err);
    return serverError('Failed to get history');
  }
}

/**
 * GET /api/inventory/sessions
 * Query params: ?stationId=10&limit=100&offset=0
 */
async function handleGetSessions(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stationId = url.searchParams.get('stationId');
    const limit = Number(url.searchParams.get('limit')) || undefined;
    const offset = Number(url.searchParams.get('offset')) || undefined;

    const sessions = await getSessions(env.DB, {
      stationId: stationId ? Number(stationId) : undefined,
      limit,
      offset,
    });

    return ok<InventorySessionsResponse>({ sessions, count: sessions.length });
  } catch (err) {
    console.error('[getSessions]', err);
    return serverError('Failed to get sessions');
  }
}

// ── User management handlers (admin only) ─────────────────────────

const VALID_ROLES: UserRole[] = ['crew', 'logistics', 'admin'];

/**
 * GET /api/users — list all users
 * Query params: ?role=crew&active=true
 */
async function handleGetUsers(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const roleFilter = url.searchParams.get('role');
    const activeFilter = url.searchParams.get('active');

    let sql =
      'SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id';
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (roleFilter && VALID_ROLES.includes(roleFilter as UserRole)) {
      conditions.push('u.role = ?');
      bindings.push(roleFilter);
    }

    if (activeFilter !== null && activeFilter !== undefined && activeFilter !== '') {
      conditions.push('u.is_active = ?');
      bindings.push(activeFilter === 'true' ? 1 : 0);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY u.name ASC';

    let stmt = env.DB.prepare(sql);
    if (bindings.length > 0) {
      stmt = stmt.bind(...bindings);
    }

    const result = await stmt.all<{
      id: number;
      email: string | null;
      name: string;
      role: UserRole;
      station_id: number | null;
      auth_method: string | null;
      is_active: number;
      created_at: string;
      updated_at: string;
      last_login_at: string | null;
      station_name: string | null;
    }>();

    const users = result.results.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      station_id: u.station_id,
      station_name: u.station_name,
      auth_method: u.auth_method,
      is_active: u.is_active === 1,
      created_at: u.created_at,
      updated_at: u.updated_at,
      last_login_at: u.last_login_at,
    }));

    return ok<UsersResponse>({ users, count: users.length });
  } catch (err) {
    console.error('[getUsers]', err);
    return serverError('Failed to get users');
  }
}

/**
 * PUT /api/users/:id/role — update a user's role
 */
async function handleUpdateUserRole(request: Request, env: Env, path: string, session: Session): Promise<Response> {
  try {
    const parts = path.split('/');
    const userId = Number(parts[3]);
    if (!userId || isNaN(userId)) return badRequest('Invalid user ID');

    const body = await request.json<{ role?: string }>();
    if (!body.role || !VALID_ROLES.includes(body.role as UserRole)) {
      return badRequest(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    // Cannot demote yourself
    if (userId === session.userId) {
      return badRequest('Cannot change your own role');
    }

    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) return notFound(`User ${userId} not found`);

    await env.DB.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.role, userId)
      .run();

    const updated = await env.DB.prepare(
      'SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id WHERE u.id = ?',
    )
      .bind(userId)
      .first<{
        id: number;
        email: string | null;
        name: string;
        role: UserRole;
        station_id: number | null;
        auth_method: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
        last_login_at: string | null;
        station_name: string | null;
      }>();

    if (!updated) return serverError('Failed to retrieve updated user');
    return ok<UserResponse>({
      user: {
        ...updated,
        is_active: updated.is_active === 1,
      },
    });
  } catch (err) {
    console.error('[updateUserRole]', err);
    return serverError('Failed to update user role');
  }
}

/**
 * PUT /api/users/:id/active — activate/deactivate a user
 */
async function handleUpdateUserActive(request: Request, env: Env, path: string, session: Session): Promise<Response> {
  try {
    const parts = path.split('/');
    const userId = Number(parts[3]);
    if (!userId || isNaN(userId)) return badRequest('Invalid user ID');

    const body = await request.json<{ is_active?: boolean }>();
    if (typeof body.is_active !== 'boolean') {
      return badRequest('is_active must be a boolean');
    }

    // Cannot deactivate yourself
    if (userId === session.userId) {
      return badRequest('Cannot change your own active status');
    }

    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) return notFound(`User ${userId} not found`);

    await env.DB.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();

    // Note: When deactivating, the validateSession middleware in auth.ts
    // will catch this on the user's next request and destroy their session.
    // No need to manually iterate KV session keys.

    const updated = await env.DB.prepare(
      'SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id WHERE u.id = ?',
    )
      .bind(userId)
      .first<{
        id: number;
        email: string | null;
        name: string;
        role: UserRole;
        station_id: number | null;
        auth_method: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
        last_login_at: string | null;
        station_name: string | null;
      }>();

    if (!updated) return serverError('Failed to retrieve updated user');
    return ok<UserResponse>({
      user: {
        ...updated,
        is_active: updated.is_active === 1,
      },
    });
  } catch (err) {
    console.error('[updateUserActive]', err);
    return serverError('Failed to update user status');
  }
}

/**
 * GET /api/dashboard/stats — comprehensive analytics for logistics dashboard
 */
async function handleGetDashboardStats(env: Env): Promise<Response> {
  try {
    // 1. Latest session per station
    const latestSessions = await env.DB.prepare(
      `SELECT s.id, s.station_id, s.submitted_at, s.submitted_by, s.item_count, s.items_short,
                st.name AS station_name, st.code AS station_code
         FROM inventory_sessions s
         JOIN stations st ON st.id = s.station_id
         WHERE s.id IN (
           SELECT MAX(id) FROM inventory_sessions GROUP BY station_id
         )
         ORDER BY st.id`,
    ).all<{
      id: number;
      station_id: number;
      submitted_at: string;
      submitted_by: string | null;
      item_count: number;
      items_short: number;
      station_name: string;
      station_code: string;
    }>();

    const sessionIds = latestSessions.results.map((s) => s.id);
    const sessionMap = new Map(latestSessions.results.map((s) => [s.station_id, s]));

    // 2. Shortages from latest sessions
    const shortagesByStation = new Map<
      number,
      { itemName: string; category: string; target: number; actual: number; delta: number }[]
    >();
    let categoryShortages: { category: string; count: number }[] = [];

    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');

      // Get individual shortage items
      const shortageRows = await env.DB.prepare(
        `SELECT h.session_id, h.item_name, h.category, h.target_count, h.actual_count, h.delta, s.station_id
           FROM inventory_history h
           JOIN inventory_sessions s ON s.id = h.session_id
           WHERE h.session_id IN (${placeholders}) AND h.status = 'short'
           ORDER BY h.delta ASC`,
      )
        .bind(...sessionIds)
        .all<{
          session_id: number;
          item_name: string;
          category: string;
          target_count: number;
          actual_count: number;
          delta: number;
          station_id: number;
        }>();

      for (const row of shortageRows.results) {
        const list = shortagesByStation.get(row.station_id) ?? [];
        list.push({
          itemName: row.item_name,
          category: row.category,
          target: row.target_count,
          actual: row.actual_count,
          delta: row.delta,
        });
        shortagesByStation.set(row.station_id, list);
      }

      // 3. Category shortage counts
      const catRows = await env.DB.prepare(
        `SELECT category, COUNT(*) as count
           FROM inventory_history
           WHERE session_id IN (${placeholders}) AND status = 'short'
           GROUP BY category
           ORDER BY count DESC`,
      )
        .bind(...sessionIds)
        .all<{ category: string; count: number }>();

      categoryShortages = catRows.results;
    }

    // Build stations array (include all active stations, even those with no sessions)
    const allStations = await env.DB.prepare(
      'SELECT id, name, code FROM stations WHERE is_active = 1 ORDER BY id',
    ).all<{ id: number; name: string; code: string }>();

    const stations = allStations.results.map((st) => {
      const session = sessionMap.get(st.id);
      return {
        stationId: st.id,
        stationName: st.name,
        stationCode: st.code,
        lastSubmission: session?.submitted_at ?? null,
        itemCount: session?.item_count ?? 0,
        itemsShort: session?.items_short ?? 0,
        shortages: shortagesByStation.get(st.id) ?? [],
      };
    });

    // 4. Order pipeline
    const orderRows = await env.DB.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all<{
      status: string;
      count: number;
    }>();

    const orderMap = new Map(orderRows.results.map((r) => [r.status, r.count]));
    const orderPipeline = {
      pending: orderMap.get('pending') ?? 0,
      inProgress: orderMap.get('in_progress') ?? 0,
      filled: orderMap.get('filled') ?? 0,
    };

    // 5. Recent sessions
    const recentRows = await env.DB.prepare(
      `SELECT s.id, s.submitted_at, s.submitted_by, s.item_count, s.items_short,
                st.name AS station_name
         FROM inventory_sessions s
         JOIN stations st ON st.id = s.station_id
         ORDER BY s.submitted_at DESC
         LIMIT 10`,
    ).all<{
      id: number;
      submitted_at: string;
      submitted_by: string | null;
      item_count: number;
      items_short: number;
      station_name: string;
    }>();

    const recentSessions = recentRows.results.map((r) => ({
      id: r.id,
      stationName: r.station_name,
      submittedAt: r.submitted_at,
      submittedBy: r.submitted_by,
      itemCount: r.item_count,
      itemsShort: r.items_short,
    }));

    return ok<DashboardStatsResponse>({
      stations,
      categoryShortages,
      orderPipeline,
      recentSessions,
    });
  } catch (err) {
    console.error('[getDashboardStats]', err);
    return serverError('Failed to load dashboard stats');
  }
}
