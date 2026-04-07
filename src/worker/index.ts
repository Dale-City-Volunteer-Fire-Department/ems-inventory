import { Env } from './types';
import { handleCorsPreflightRequest, addCorsHeaders } from './middleware/cors';
import { handleGetTemplate, handleSubmitInventory } from './inventory';
import { handleGetItems, handleUpdateItem } from './items';
import { handleGetStations } from './stations';
import { handleGetOrders, handleUpdateOrder } from './orders';
import { handleGetTargets, handleUpdateTarget } from './stock-targets';
import { getHistory } from './lib/db';
import { ok, badRequest, notFound, forbidden, serverError } from './lib/response';
import type { Category } from '../shared/types';
import { handleEntraLogin, handleEntraCallback } from './auth/entra';
import { handleMagicLinkRequest, handleMagicLinkVerify } from './auth/magic-link';
import { handlePinAuth } from './auth/pin';
import { handleAuthMe, handleAuthLogout } from './auth/handlers';
import { requireAuth } from './middleware/auth';
import type { Session } from './middleware/auth';
import { requireRole } from './middleware/rbac';
import type { UserRole } from '../shared/types';

// ── CSRF Origin verification ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://emsinventory.dcvfd.org',
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
];

// Auth callback routes that are GET-based redirects and don't need CSRF
const CSRF_EXEMPT_PATHS = [
  '/api/auth/entra/callback',
  '/api/auth/magic-link/verify',
];

function verifyCsrfOrigin(request: Request): Response | null {
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
    return ok({ status: 'ok', app: env.APP_NAME, timestamp: new Date().toISOString() });
  }

  // ── Auth routes ───────────────────────────────────────────────────
  // Entra ID SSO
  if (path === '/api/auth/entra/login' && method === 'GET') {
    return handleEntraLogin(request, env);
  }
  if (path === '/api/auth/entra/callback' && method === 'GET') {
    return handleEntraCallback(request, env);
  }
  // Magic Link
  if (path === '/api/auth/magic-link/request' && method === 'POST') {
    return handleMagicLinkRequest(request, env);
  }
  if (path === '/api/auth/magic-link/verify' && method === 'GET') {
    return handleMagicLinkVerify(request, env);
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

    await env.DB
      .prepare(`UPDATE items SET name = ?, category = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(name, category, sort_order, is_active, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    return ok({ item: updated });
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

    await env.DB
      .prepare(`UPDATE stock_targets SET target_count = ?, updated_at = datetime('now') WHERE id = ?`)
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

    const station = await env.DB.prepare('SELECT id, name FROM stations WHERE id = ?').bind(stationId).first<{ id: number; name: string }>();
    if (!station) return notFound(`Station ${stationId} not found`);

    // Get the most recent session for this station
    const lastSession = await env.DB
      .prepare('SELECT id, submitted_at, items_short FROM inventory_sessions WHERE station_id = ? ORDER BY submitted_at DESC LIMIT 1')
      .bind(stationId)
      .first<{ id: number; submitted_at: string; items_short: number }>();

    // Get shortages from the most recent session
    let shortages: { itemName: string; category: string; target: number; actual: number; delta: number }[] = [];
    if (lastSession) {
      const rows = await env.DB
        .prepare('SELECT item_name, category, target_count, actual_count, delta FROM inventory_history WHERE session_id = ? AND status = ? ORDER BY delta ASC')
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

    return ok({ history, count: history.length });
  } catch (err) {
    console.error('[getHistory]', err);
    return serverError('Failed to get history');
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

    let sql = 'SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id';
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

    return ok({ users, count: users.length });
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

    await env.DB
      .prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.role, userId)
      .run();

    const updated = await env.DB
      .prepare('SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id WHERE u.id = ?')
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

    return ok({
      user: updated ? {
        ...updated,
        is_active: updated.is_active === 1,
      } : null,
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

    await env.DB
      .prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();

    // Note: When deactivating, the validateSession middleware in auth.ts
    // will catch this on the user's next request and destroy their session.
    // No need to manually iterate KV session keys.

    const updated = await env.DB
      .prepare('SELECT u.id, u.email, u.name, u.role, u.station_id, u.auth_method, u.is_active, u.created_at, u.updated_at, u.last_login_at, s.name AS station_name FROM users u LEFT JOIN stations s ON u.station_id = s.id WHERE u.id = ?')
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

    return ok({
      user: updated ? {
        ...updated,
        is_active: updated.is_active === 1,
      } : null,
    });
  } catch (err) {
    console.error('[updateUserActive]', err);
    return serverError('Failed to update user status');
  }
}
