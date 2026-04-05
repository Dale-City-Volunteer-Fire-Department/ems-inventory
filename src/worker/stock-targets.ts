// Stock target (PAR level) handlers

import type { Env } from './types';
import { getStockTargets, updateStockTarget } from './lib/db';
import { ok, badRequest, serverError } from './lib/response';

/**
 * GET /api/stock-targets
 * Query params: ?stationId=10 (required)
 */
export async function handleGetTargets(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stationIdStr = url.searchParams.get('stationId');

    if (!stationIdStr) {
      return badRequest('stationId query parameter is required');
    }

    const stationId = Number(stationIdStr);
    if (isNaN(stationId)) {
      return badRequest('stationId must be a number');
    }

    const targets = await getStockTargets(env.DB, stationId);
    return ok({ stationId, targets, count: targets.length });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to get stock targets');
  }
}

/**
 * PUT /api/stock-targets
 * Body: { itemId: number, stationId: number, targetCount: number }
 * TODO: Restrict to logistics/admin roles
 */
export async function handleUpdateTarget(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ itemId: number; stationId: number; targetCount: number }>();

    if (!body.itemId || !body.stationId || body.targetCount === undefined) {
      return badRequest('itemId, stationId, and targetCount are required');
    }
    if (typeof body.targetCount !== 'number' || body.targetCount < 0) {
      return badRequest('targetCount must be a non-negative number');
    }

    await updateStockTarget(env.DB, body.itemId, body.stationId, body.targetCount);
    return ok({ itemId: body.itemId, stationId: body.stationId, targetCount: body.targetCount });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to update stock target');
  }
}
