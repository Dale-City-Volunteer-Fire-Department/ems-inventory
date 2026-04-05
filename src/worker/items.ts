// Item/catalog handlers

import type { Env } from './types';
import { getItems, upsertItem } from './lib/db';
import { ok, badRequest, serverError } from './lib/response';
import type { Category } from '@shared/types';

const VALID_CATEGORIES: Category[] = [
  'Airway', 'Breathing', 'Circulation', 'Medications', 'Splinting', 'Burn', 'OB/Peds', 'Misc',
];

/**
 * GET /api/items
 * Query params: ?active=true|false&category=Airway
 */
export async function handleGetItems(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const activeParam = url.searchParams.get('active');
    const categoryParam = url.searchParams.get('category');

    const activeOnly = activeParam !== 'false';
    let items = await getItems(env.DB, activeOnly);

    if (categoryParam) {
      items = items.filter((i) => i.category === categoryParam);
    }

    return ok({ items, count: items.length });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to get items');
  }
}

/**
 * PUT /api/items
 * Body: { id?: number, name: string, category: Category, sort_order?: number, is_active?: boolean }
 * TODO: Restrict to logistics/admin roles
 */
export async function handleUpdateItem(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json<{
      id?: number;
      name: string;
      category: Category;
      sort_order?: number;
      is_active?: boolean;
    }>();

    if (!body.name || !body.category) {
      return badRequest('name and category are required');
    }
    if (!VALID_CATEGORIES.includes(body.category)) {
      return badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    const item = await upsertItem(env.DB, body);
    return ok({ item });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to update item');
  }
}
