import type { Env } from '../types';
import { destroySession, parseSessionCookie, buildClearSessionCookie } from './session';
import { validateSession } from '../middleware/auth';
import { ok, unauthorized } from '../lib/response';

/**
 * GET /api/auth/me
 * Returns the current session data, or 401 if not authenticated.
 * Uses validateSession to enforce is_active check.
 */
export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const session = await validateSession(request, env);

  if (!session) {
    return unauthorized('Authentication required');
  }

  return ok({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    stationId: session.stationId,
    authMethod: session.authMethod,
    photoUrl: session.photoUrl ?? null,
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
