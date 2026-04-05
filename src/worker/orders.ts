// Order handlers

import type { Env } from './types';
import { getOrders, updateOrderStatus } from './lib/db';
import { ok, badRequest, notFound, serverError } from './lib/response';
import type { OrderStatus } from '@shared/types';

const VALID_STATUSES: OrderStatus[] = ['pending', 'in_progress', 'filled'];
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress'],
  in_progress: ['filled'],
  filled: [],
};

/**
 * GET /api/orders
 * Query params: ?stationId=10&status=pending&limit=50&offset=0
 * TODO: Restrict to logistics/admin roles
 */
export async function handleGetOrders(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stationId = url.searchParams.get('stationId');
    const status = url.searchParams.get('status') as OrderStatus | null;
    const limit = Number(url.searchParams.get('limit')) || undefined;
    const offset = Number(url.searchParams.get('offset')) || undefined;

    if (status && !VALID_STATUSES.includes(status)) {
      return badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const orders = await getOrders(env.DB, {
      stationId: stationId ? Number(stationId) : undefined,
      status: status ?? undefined,
      limit,
      offset,
    });

    return ok({ orders, count: orders.length });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to get orders');
  }
}

/**
 * PUT /api/orders
 * Body: { orderId: number, status: OrderStatus, filledBy?: string }
 * Status transitions: pending → in_progress → filled
 * TODO: Restrict to logistics/admin roles
 */
export async function handleUpdateOrder(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{ orderId: number; status: OrderStatus; filledBy?: string }>();

    if (!body.orderId || !body.status) {
      return badRequest('orderId and status are required');
    }
    if (!VALID_STATUSES.includes(body.status)) {
      return badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // Check current order exists and validate status transition
    const current = await env.DB.prepare('SELECT id, status FROM orders WHERE id = ?')
      .bind(body.orderId)
      .first<{ id: number; status: string }>();

    if (!current) {
      return notFound(`Order ${body.orderId} not found`);
    }

    const allowed = STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(body.status)) {
      return badRequest(`Cannot transition from '${current.status}' to '${body.status}'`);
    }

    await updateOrderStatus(env.DB, body.orderId, body.status, body.filledBy);
    return ok({ orderId: body.orderId, status: body.status });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to update order');
  }
}
