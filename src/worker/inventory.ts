// Inventory handlers — template + submission

import type { Env } from './types';
import { getInventoryTemplate, submitInventory } from './lib/db';
import { ok, badRequest, notFound, serverError } from './lib/response';

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

    const items = await getInventoryTemplate(env.DB, stationId);
    if (items.length === 0) {
      return notFound(`No items found for station ${stationId}`);
    }

    // Group by category
    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      const cat = item.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    return ok({ stationId, categories: grouped, totalItems: items.length });
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

    return ok({
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
