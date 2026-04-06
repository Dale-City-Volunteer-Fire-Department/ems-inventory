import type { Env } from '../types';
import { createSession, buildSessionCookie } from './session';
import { upsertUser } from './user-db';
import { ok, badRequest, serverError } from '../lib/response';

/** 15 minutes in seconds */
const MAGIC_LINK_TTL = 15 * 60;

const ALLOWED_DOMAIN = 'pwcgov.org';
const FROM_ADDRESS = 'DCVFD EMS Inventory <noreply@dcvfd.org>';

// ── Handlers ───────────────────────────────────────────────────────

/**
 * POST /api/auth/magic-link/request
 * Body: { email: string }
 * Generates a magic link token and sends it via Resend.
 * Only @pwcgov.org addresses are allowed.
 */
export async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return badRequest('Valid email address required');
    }

    // Restrict to allowed domain
    const domain = email.split('@')[1];
    if (domain !== ALLOWED_DOMAIN) {
      return badRequest(`Only @${ALLOWED_DOMAIN} email addresses are allowed`);
    }

    // Generate a cryptographically random token
    const token = crypto.randomUUID();

    // Store token → email mapping in KV with 15 min TTL
    await env.SESSIONS.put(`magic_link:${token}`, JSON.stringify({ email }), { expirationTtl: MAGIC_LINK_TTL });

    const verifyUrl = `https://emsinventory.dcvfd.org/api/auth/magic-link/verify?token=${token}`;

    // Send email via Resend
    if (env.RESEND_API_KEY) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [email],
          subject: 'Sign in to DCVFD EMS Inventory',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #c41e3a;">DCVFD EMS Inventory</h2>
              <p>Click the button below to sign in. This link expires in 15 minutes.</p>
              <a href="${verifyUrl}"
                 style="display: inline-block; background: #c41e3a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
                Sign In
              </a>
              <p style="color: #666; font-size: 13px; margin-top: 24px;">
                If you didn't request this, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">Dale City Volunteer Fire Department</p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text().catch(() => 'Unknown error');
        console.error('[magic-link] Resend error:', errBody);
        return serverError('Failed to send magic link email');
      }
    }

    return ok({ message: 'Magic link sent — check your email' });
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
