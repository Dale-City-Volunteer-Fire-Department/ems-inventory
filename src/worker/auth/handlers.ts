import type { Env } from '../types';
import { getSession, destroySession, parseSessionCookie, buildClearSessionCookie } from './session';
import { ok, unauthorized } from '../lib/response';

/**
 * GET /api/auth/me
 * Returns the current session data, or 401 if not authenticated.
 */
export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = parseSessionCookie(cookieHeader);

  if (!sessionId) {
    return unauthorized('Not authenticated');
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return unauthorized('Session expired');
  }

  return ok({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    stationId: session.stationId,
    authMethod: session.authMethod,
    expiresAt: session.expiresAt,
  });
}

/**
 * POST /api/auth/logout
 * Destroys the current session and clears the cookie.
 */
export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = parseSessionCookie(cookieHeader);

  if (sessionId) {
    await destroySession(env, sessionId);
  }

  return new Response(JSON.stringify({ message: 'Logged out' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearSessionCookie(),
    },
  });
}
