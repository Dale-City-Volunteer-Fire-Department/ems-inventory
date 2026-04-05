// Authentication middleware — validates session from cookie

import type { Env } from '../types';
import type { Session } from '../auth/session';
import { getSession, parseSessionCookie } from '../auth/session';
import { unauthorized } from '../lib/response';

export type { Session };

/**
 * Validate the session from the request cookie.
 * Returns the Session if valid, null otherwise.
 */
export async function validateSession(request: Request, env: Env): Promise<Session | null> {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) return null;

  return getSession(env, sessionId);
}

/**
 * Require authentication. Returns Session or a 401 Response.
 * Use in route handlers: const session = await requireAuth(request, env); if (session instanceof Response) return session;
 */
export async function requireAuth(request: Request, env: Env): Promise<Session | Response> {
  const session = await validateSession(request, env);
  if (!session) {
    return unauthorized('Authentication required');
  }
  return session;
}
