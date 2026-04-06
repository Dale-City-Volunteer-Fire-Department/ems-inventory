import { Env } from './types';
import { handleCorsPreflightRequest, addCorsHeaders } from './middleware/cors';
import { handleGetTemplate, handleSubmitInventory } from './inventory';
import { handleGetItems, handleUpdateItem } from './items';
import { handleGetStations } from './stations';
import { handleGetOrders, handleUpdateOrder } from './orders';
import { handleGetTargets, handleUpdateTarget } from './stock-targets';
import { getHistory } from './lib/db';
import { ok, badRequest, notFound, serverError } from './lib/response';
import { handleEntraLogin, handleEntraCallback } from './auth/entra';
import { handleMagicLinkRequest, handleMagicLinkVerify } from './auth/magic-link';
import { handlePinAuth } from './auth/pin';
import { handleAuthMe, handleAuthLogout } from './auth/handlers';
import { requireAuth } from './middleware/auth';
import { requireRole } from './middleware/rbac';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    const corsResponse = handleCorsPreflightRequest(request);
    if (corsResponse) return corsResponse;

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
  // GET /api/inventory/current/:stationId/summary — dashboard summary
  if (/^\/api\/inventory\/current\/\d+\/summary$/.test(path) && method === 'GET') {
    return handleGetInventorySummary(request, env, path);
  }
  if (path.startsWith('/api/inventory/current/') && method === 'GET') {
    return handleGetTemplate(request, env);
  }
  if (path === '/api/inventory/submit' && method === 'POST') {
    return handleSubmitInventory(request, env);
  }
  if (path === '/api/inventory/history' && method === 'GET') {
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

    await env.DB
      .prepare(`UPDATE items SET name = ?, category = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(name, category, sort_order, is_active, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    return ok({ item: updated });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to update item');
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
    return serverError(err instanceof Error ? err.message : 'Failed to update stock target');
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
    return serverError(err instanceof Error ? err.message : 'Failed to get inventory summary');
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
    return serverError(err instanceof Error ? err.message : 'Failed to get history');
  }
}
