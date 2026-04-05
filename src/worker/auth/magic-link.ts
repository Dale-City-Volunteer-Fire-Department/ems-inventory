import type { Env } from '../types';
import { createSession, buildSessionCookie } from './session';
import { upsertUser } from './user-db';
import { ok, badRequest, serverError } from '../lib/response';

/** 15 minutes in seconds */
const MAGIC_LINK_TTL = 15 * 60;

// ── Handlers ───────────────────────────────────────────────────────

/**
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 * Generates a magic link token stored in KV (15 min TTL).
 * For now returns the token in the response (email integration later).
 */
export async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return badRequest('Valid email address required');
    }

    // Generate a cryptographically random token
    const token = crypto.randomUUID();

    // Store token → email mapping in KV with 15 min TTL
    await env.SESSIONS.put(`magic_link:${token}`, JSON.stringify({ email }), { expirationTtl: MAGIC_LINK_TTL });

    // TODO: Send email with magic link. For now, return the token directly.
    const verifyUrl = `https://inventory.dcvfd.org/api/auth/magic-link/verify?token=${token}`;

    return ok({
      message: 'Magic link created',
      // DEV ONLY — remove when email sending is integrated
      token,
      verifyUrl,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Magic link request failed');
  }
}

/**
 * GET /api/auth/magic-link/verify?token=X
 * Validates the token against KV, creates a session, redirects to app.
 */
export async function handleMagicLinkVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return badRequest('Missing token parameter');
    }

    // Look up and consume the token
    const raw = await env.SESSIONS.get(`magic_link:${token}`, 'text');
    if (!raw) {
      return badRequest('Invalid or expired magic link');
    }
    // Delete immediately to prevent reuse
    await env.SESSIONS.delete(`magic_link:${token}`);

    const { email } = JSON.parse(raw) as { email: string };

    // Create/update user
    const user = await upsertUser(env.DB, {
      email,
      name: email.split('@')[0], // Default name from email prefix
      authMethod: 'magic_link',
    });

    // Create session
    const { sessionId } = await createSession(env, {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      stationId: user.stationId,
      authMethod: 'magic_link',
    });

    // Update last_login_at
    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();

    // Redirect to app with session cookie
    const cookie = buildSessionCookie(sessionId, 'magic_link');
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': cookie,
      },
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Magic link verification failed');
  }
}
