// Authentication middleware — validates session from cookie

import type { Env } from '../types';
import type { Session } from '../auth/session';
import { getSession, destroySession, parseSessionCookie } from '../auth/session';
import { unauthorized } from '../lib/response';

export type { Session };

/**
 * Validate the session from the request cookie.
 * Returns the Session if valid, null otherwise.
 * Also verifies the user is still active in the database.
 */
export async function validateSession(request: Request, env: Env): Promise<Session | null> {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) return null;

  const session = await getSession(env, sessionId);
  if (!session) return null;

  // Verify user is still active in the database
  const user = await env.DB.prepare('SELECT is_active FROM users WHERE id = ?')
    .bind(session.userId)
    .first<{ is_active: number }>();

  if (!user || user.is_active === 0) {
    // User deactivated or deleted — destroy the session
    await destroySession(env, sessionId);
    return null;
  }

  return session;
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
