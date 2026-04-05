// Station handlers

import type { Env } from './types';
import { getStations } from './lib/db';
import { ok, serverError } from './lib/response';

/**
 * GET /api/stations
 * Returns all active stations.
 */
export async function handleGetStations(_request: Request, env: Env): Promise<Response> {
  try {
    const stations = await getStations(env.DB);
    return ok({ stations });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Failed to get stations');
  }
}
