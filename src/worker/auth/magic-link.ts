// Magic link authentication for the public inventory form
// POST /api/public/magic-link/request  — send a sign-in link email
// GET  /api/public/magic-link/verify   — verify a token from the link

import type { Env } from '../types';
import { ok, badRequest, tooManyRequests, serverError } from '../lib/response';
import { sendEmail } from '../email/send';
import { renderMagicLinkEmail } from '../email/templates';

// ── Constants ────────────────────────────────────────────────────────

const MAGIC_LINK_TTL = 30 * 60; // 30 minutes in seconds
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_REQUESTS_PER_HOUR_IP = 20;
const SESSION_TOKEN_TTL = 2 * 60 * 60; // 2 hours in seconds
const PUBLIC_FORM_URL = 'https://emsinventory.dcvfd.org/submit';

// ── Interfaces ───────────────────────────────────────────────────────

export interface MagicLinkTokenData {
  email: string;
  created_at: number;
}

interface RateLimitData {
  count: number;
  window_start: number;
}

// ── KV key helpers ───────────────────────────────────────────────────

function magicTokenKey(token: string): string {
  return `magic:${token}`;
}

// MEDIUM-1: Hash the email with SHA-256 so PII is never stored in KV keys
async function rateLimitKey(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `magic_rl:${hex}`;
}

function ipRateLimitKey(ip: string): string {
  return `magic_rl_ip:${ip}`;
}

// ── Email validation ─────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

// ── HMAC token generation ────────────────────────────────────────────

async function generateHmacToken(email: string, timestamp: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const message = encoder.encode(`${email}:${timestamp}`);

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const bytes = new Uint8Array(signature);

  // Append 8 bytes of random entropy so tokens for the same email at the same second are unique
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);

  const allBytes = new Uint8Array(bytes.length + randomBytes.length);
  allBytes.set(bytes);
  allBytes.set(randomBytes, bytes.length);

  return Array.from(allBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Rate limiting ────────────────────────────────────────────────────

async function checkRateLimit(kv: KVNamespace, email: string): Promise<boolean> {
  const key = await rateLimitKey(email);
  const raw = await kv.get(key, 'text');

  const now = Math.floor(Date.now() / 1000);

  if (raw) {
    try {
      const data = JSON.parse(raw) as RateLimitData;
      // If within the same window
      if (now - data.window_start < RATE_LIMIT_WINDOW) {
        if (data.count >= MAX_REQUESTS_PER_HOUR) {
          return false; // rate limited
        }
        // Increment
        data.count += 1;
        await kv.put(key, JSON.stringify(data), {
          expirationTtl: RATE_LIMIT_WINDOW - (now - data.window_start),
        });
        return true;
      }
    } catch {
      // Corrupt data — reset below
    }
  }

  // First request or window expired — start fresh
  const data: RateLimitData = { count: 1, window_start: now };
  await kv.put(key, JSON.stringify(data), { expirationTtl: RATE_LIMIT_WINDOW });
  return true;
}

// MEDIUM-2: IP-based rate limit — 20 requests per hour per IP
async function checkIpRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = ipRateLimitKey(ip);
  const raw = await kv.get(key, 'text');

  const now = Math.floor(Date.now() / 1000);

  if (raw) {
    try {
      const data = JSON.parse(raw) as RateLimitData;
      if (now - data.window_start < RATE_LIMIT_WINDOW) {
        if (data.count >= MAX_REQUESTS_PER_HOUR_IP) {
          return false; // rate limited
        }
        data.count += 1;
        await kv.put(key, JSON.stringify(data), {
          expirationTtl: RATE_LIMIT_WINDOW - (now - data.window_start),
        });
        return true;
      }
    } catch {
      // Corrupt data — reset below
    }
  }

  // First request or window expired — start fresh
  const data: RateLimitData = { count: 1, window_start: now };
  await kv.put(key, JSON.stringify(data), { expirationTtl: RATE_LIMIT_WINDOW });
  return true;
}

// ── Handlers ─────────────────────────────────────────────────────────

/**
 * POST /api/public/magic-link/request
 * Body: { email: string }
 * Returns: { success: true }
 */
export async function handleMagicLinkRequest(request: Request, env: Env): Promise<Response> {
  try {
    // MEDIUM-2: IP-based rate limit — check before email limit
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip || ip === 'unknown') {
      return badRequest('Unable to determine client IP');
    }
    const ipAllowed = await checkIpRateLimit(env.SESSIONS, ip);
    if (!ipAllowed) {
      return tooManyRequests('Too many sign-in requests. Please try again later.');
    }

    const body = (await request.json()) as { email?: string };

    if (!body.email || typeof body.email !== 'string') {
      return badRequest('email is required');
    }

    const email = body.email.trim().toLowerCase();

    if (!isValidEmail(email)) {
      return badRequest('Invalid email address');
    }

    // Rate limit: max 5 requests per email per hour
    const allowed = await checkRateLimit(env.SESSIONS, email);
    if (!allowed) {
      return tooManyRequests('Too many sign-in requests. Please try again later.');
    }

    // Generate HMAC token
    const timestamp = Date.now();
    const token = await generateHmacToken(email, timestamp, env.MAGIC_LINK_SECRET);

    // Store in KV with 30-min TTL
    const tokenData: MagicLinkTokenData = { email, created_at: timestamp };
    await env.SESSIONS.put(magicTokenKey(token), JSON.stringify(tokenData), {
      expirationTtl: MAGIC_LINK_TTL,
    });

    // Build magic link URL
    const magicUrl = `${PUBLIC_FORM_URL}?token=${token}`;

    // Send email via Resend
    const { html, text, subject } = renderMagicLinkEmail({ email, magicUrl });
    const result = await sendEmail(env, { to: email, subject, html, text });

    if (!result.success) {
      console.error('[handleMagicLinkRequest] Email send failed:', result.error);
      // Still return success to avoid leaking whether the email exists
    }

    return ok({ success: true });
  } catch (err) {
    console.error('[handleMagicLinkRequest]', err);
    return serverError('Failed to send sign-in link');
  }
}

/**
 * GET /api/public/magic-link/verify?token={token}
 * Returns: { success: true, email: string, token: string }
 * HIGH-1: The magic link token is consumed on first use. A new short-lived
 * session token is issued and returned — the client uses this going forward.
 */
export async function handleMagicLinkVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return badRequest('token is required');
    }

    const raw = await env.SESSIONS.get(magicTokenKey(token), 'text');
    if (!raw) {
      return ok({ success: false, error: 'Invalid or expired link' });
    }

    let tokenData: MagicLinkTokenData;
    try {
      tokenData = JSON.parse(raw) as MagicLinkTokenData;
    } catch {
      return ok({ success: false, error: 'Invalid token data' });
    }

    const email = tokenData.email;

    // HIGH-1: Invalidate the magic link token immediately — one-time use only
    await env.SESSIONS.delete(magicTokenKey(token));

    // Issue a new session token stored under the public: prefix with counters and 2h TTL
    const sessionBytes = new Uint8Array(32);
    crypto.getRandomValues(sessionBytes);
    const sessionToken = Array.from(sessionBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const sessionData = {
      email,
      created: Date.now(),
      submissions: 0,
      uploads: 0,
    };
    await env.SESSIONS.put(`public:${sessionToken}`, JSON.stringify(sessionData), {
      expirationTtl: SESSION_TOKEN_TTL,
    });

    return ok({ success: true, email, token: sessionToken });
  } catch (err) {
    console.error('[handleMagicLinkVerify]', err);
    return serverError('Failed to verify sign-in link');
  }
}

/**
 * Look up a magic link token and return its data if valid.
 * Returns null if the token is invalid or expired.
 */
export async function getMagicLinkToken(kv: KVNamespace, token: string): Promise<MagicLinkTokenData | null> {
  const raw = await kv.get(magicTokenKey(token), 'text');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MagicLinkTokenData;
  } catch {
    return null;
  }
}
