import type { Env } from '../types';
import { createSession, buildSessionCookie } from './session';
import { upsertUser } from './user-db';
import { badRequest, forbidden, serverError } from '../lib/response';

// ── OIDC helpers ───────────────────────────────────────────────────

function tokenEndpoint(env: Env): string {
  return `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;
}

function baseUrl(_env: Env): string {
  return 'https://emsinventory.dcvfd.org';
}

/** SHA-256 hash → base64url (for PKCE S256) */
async function sha256Base64Url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a random code verifier for PKCE */
function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decode a JWT payload (no signature verification — token comes from Microsoft's token endpoint over TLS) */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = parts[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decoded);
}

// ── Handlers ───────────────────────────────────────────────────────

/**
 * GET /api/auth/entra/login
 * Redirects to Microsoft login with OIDC Authorization Code + PKCE
 */
export async function handleEntraLogin(_request: Request, env: Env): Promise<Response> {
  try {
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await sha256Base64Url(codeVerifier);

    // Store state + code_verifier in KV (5 min TTL)
    await env.SESSIONS.put(`entra_state:${state}`, JSON.stringify({ codeVerifier }), { expirationTtl: 300 });

    const tenant = env.AZURE_AD_TENANT_ID;
    const clientId = env.AZURE_AD_CLIENT_ID;
    const redirectUri = `${baseUrl(env)}/api/auth/entra/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid profile email User.Read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });

    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
    return Response.redirect(url, 302);
  } catch (err) {
    console.error('[handleEntraLogin]', err);
    return serverError('Entra login failed');
  }
}

/**
 * GET /api/auth/entra/callback?code=X&state=Y
 * Exchanges authorization code for tokens, creates session
 */
export async function handleEntraCallback(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      const desc = url.searchParams.get('error_description') ?? error;
      console.error('[entra] Auth error:', error, desc);
      return badRequest('Authentication failed. Please try again.');
    }

    if (!code || !state) {
      return badRequest('Missing code or state parameter');
    }

    // Validate state and retrieve code_verifier
    const stateData = await env.SESSIONS.get(`entra_state:${state}`, 'text');
    if (!stateData) {
      return badRequest('Invalid or expired state parameter');
    }
    await env.SESSIONS.delete(`entra_state:${state}`);

    const { codeVerifier } = JSON.parse(stateData) as { codeVerifier: string };

    // Exchange code for tokens
    const redirectUri = `${baseUrl(env)}/api/auth/entra/callback`;
    const tokenResponse = await fetch(tokenEndpoint(env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.AZURE_AD_CLIENT_ID,
        client_secret: env.AZURE_AD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[entra] Token exchange failed:', errorBody);
      return serverError('Token exchange failed');
    }

    const tokenData = (await tokenResponse.json()) as { id_token: string; access_token: string };
    const idPayload = decodeJwtPayload(tokenData.id_token);

    const email = (idPayload.email ?? idPayload.preferred_username ?? '') as string;
    const name =
      (idPayload.name as string) ??
      `${(idPayload.given_name as string) ?? ''} ${(idPayload.family_name as string) ?? ''}`.trim() ??
      email;

    if (!email) {
      return badRequest('No email in ID token');
    }

    // Domain allowlist — only approved orgs may authenticate
    const ALLOWED_DOMAINS = ['pwcgov.org', 'dcvfd.org'];
    const domain = email.split('@').pop()?.toLowerCase();
    if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
      return forbidden('Account not authorized for this application');
    }

    // Fetch profile photo from Microsoft Graph (best-effort)
    let photoUrl: string | null = null;
    try {
      const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (photoResponse.ok) {
        const photoBuffer = await photoResponse.arrayBuffer();
        const contentType = photoResponse.headers.get('Content-Type') ?? 'image/jpeg';
        const base64 = btoa(String.fromCharCode(...new Uint8Array(photoBuffer)));
        photoUrl = `data:${contentType};base64,${base64}`;
        // Cache photo in KV (24h TTL) keyed by email
        await env.SESSIONS.put(`photo:${email}`, photoUrl, { expirationTtl: 86400 });
      }
    } catch (err) {
      console.error('[entra] Photo fetch failed (non-fatal):', err);
    }

    // Create/update user (returns null when the account is deactivated)
    const user = await upsertUser(env.DB, {
      email,
      name,
      authMethod: 'entra_sso',
    });

    if (!user) {
      return forbidden('Account is deactivated');
    }

    // Create session
    const { sessionId } = await createSession(env, {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      stationId: user.stationId,
      authMethod: 'entra_sso',
      photoUrl,
    });

    // Update last_login_at
    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();

    // Redirect to app with session cookie
    const cookie = buildSessionCookie(sessionId, 'entra_sso');
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': cookie,
      },
    });
  } catch (err) {
    console.error('[handleEntraCallback]', err);
    return serverError('Entra callback failed');
  }
}
