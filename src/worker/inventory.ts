// Inventory handlers — template + submission

import type { Env } from './types';
import { getInventoryTemplate, submitInventory } from './lib/db';
import { ok, badRequest, notFound, serverError } from './lib/response';
import type { InventoryTemplateItem, InventorySubmitResponse } from '@shared/api-responses';

/**
 * GET /api/inventory/current/:stationId
 * Returns all active items for a station with target counts,
 * grouped by category, sorted by category then sort_order.
 */
export async function handleGetTemplate(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/inventory/current/:stationId → parts = ['', 'api', 'inventory', 'current', ':stationId']
    const stationIdStr = parts[4];
    const stationId = Number(stationIdStr);
    if (!stationId || isNaN(stationId)) {
      return badRequest('Invalid station ID');
    }

    const rows = await getInventoryTemplate(env.DB, stationId);
    if (rows.length === 0) {
      return notFound(`No items found for station ${stationId}`);
    }

    // Map to the shape the frontend expects (InventoryTemplateItem)
    const items: InventoryTemplateItem[] = rows.map((r) => ({
      id: 0,
      item_id: r.item_id,
      station_id: stationId,
      target_count: r.target_count,
      actual_count: null,
      delta: null,
      status: 'not_entered' as const,
      session_id: null,
      name: r.item_name,
      category: r.category,
      sort_order: r.sort_order,
    }));

    return ok<InventoryTemplateItem[]>(items);
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to get template');
  }
}

/**
 * POST /api/inventory/submit
 * Body: { stationId: number, counts: { itemId: number, actualCount: number }[], submittedBy?: string }
 *
 * Validates all active items have counts, creates session + history,
 * auto-generates resupply order if shortages detected.
 */
export async function handleSubmitInventory(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{
      stationId: number;
      counts: { itemId: number; actualCount: number }[];
      submittedBy?: string;
    }>();

    if (!body.stationId || !Array.isArray(body.counts)) {
      return badRequest('Request must include stationId and counts array');
    }

    // Validate each count entry
    for (const c of body.counts) {
      if (typeof c.itemId !== 'number' || typeof c.actualCount !== 'number') {
        return badRequest('Each count must have numeric itemId and actualCount');
      }
      if (c.actualCount < 0) {
        return badRequest('actualCount cannot be negative');
      }
    }

    const result = await submitInventory(env.DB, body.stationId, body.counts, body.submittedBy);

    return ok<InventorySubmitResponse>({
      sessionId: result.sessionId,
      itemCount: result.itemCount,
      itemsShort: result.itemsShort,
      orderId: result.orderId,
      message:
        result.itemsShort > 0
          ? `Inventory submitted. ${result.itemsShort} item(s) short — resupply order created.`
          : 'Inventory submitted. All items at or above target.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit inventory';
    // Missing counts is a validation error, not a server error
    if (message.startsWith('Missing counts')) {
      return badRequest(message);
    }
    return serverError(message);
  }
}
