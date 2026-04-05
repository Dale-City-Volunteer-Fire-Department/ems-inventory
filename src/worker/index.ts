import { Env } from './types';
import { handleCorsPreflightRequest, addCorsHeaders } from './middleware/cors';
import { handleGetTemplate, handleSubmitInventory } from './inventory';
import { handleGetItems, handleUpdateItem } from './items';
import { handleGetStations } from './stations';
import { handleGetOrders, handleUpdateOrder } from './orders';
import { handleGetTargets, handleUpdateTarget } from './stock-targets';
import { getHistory } from './lib/db';
import { ok, notFound, serverError } from './lib/response';
import { handleEntraLogin, handleEntraCallback } from './auth/entra';
import { handleMagicLinkRequest, handleMagicLinkVerify } from './auth/magic-link';
import { handlePinAuth } from './auth/pin';
import { handleAuthMe, handleAuthLogout } from './auth/handlers';

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
  if (path === '/api/items' && method === 'PUT') {
    // TODO: RBAC — logistics/admin only
    return handleUpdateItem(request, env);
  }

  // ── Stock Targets (PAR levels) ────────────────────────────────────
  if (path === '/api/stock-targets' && method === 'GET') {
    return handleGetTargets(request, env);
  }
  if (path === '/api/stock-targets' && method === 'PUT') {
    // TODO: RBAC — logistics/admin only
    return handleUpdateTarget(request, env);
  }

  // ── Inventory ─────────────────────────────────────────────────────
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
    // TODO: RBAC — logistics/admin only
    return handleGetOrders(request, env);
  }
  if (path === '/api/orders' && method === 'PUT') {
    // TODO: RBAC — logistics/admin only
    return handleUpdateOrder(request, env);
  }

  // ── Static / fallback ─────────────────────────────────────────────
  if (!path.startsWith('/api/')) {
    return new Response('EMS Inventory — Coming Soon', { status: 200 });
  }

  return notFound('Route not found');
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
