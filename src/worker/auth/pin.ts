import type { Env } from '../types';
import { createSession, buildSessionCookie } from './session';
import { badRequest, unauthorized, serverError, tooManyRequests } from '../lib/response';

/** Rate limit: max 10 attempts per IP per 5 minutes */
const PIN_RATE_LIMIT = 10;
const PIN_RATE_WINDOW = 5 * 60; // 5 minutes in seconds

async function checkPinRateLimit(env: Env, ip: string): Promise<boolean> {
  const key = `rate:pin:${ip}`;
  const raw = await env.SESSIONS.get(key, 'text');
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= PIN_RATE_LIMIT) {
    return false; // rate limited
  }

  await env.SESSIONS.put(key, String(count + 1), { expirationTtl: PIN_RATE_WINDOW });
  return true; // allowed
}

// ── Constant-time comparison ───────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks on PIN validation.
 * Both strings are compared byte-by-byte regardless of where they differ.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Pad to same length to avoid length-based timing leak
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let result = aBytes.length === bBytes.length ? 0 : 1;

  for (let i = 0; i < maxLen; i++) {
    const aByte = i < aBytes.length ? aBytes[i] : 0;
    const bByte = i < bBytes.length ? bBytes[i] : 0;
    result |= aByte ^ bByte;
  }

  return result === 0;
}

// ── Handler ────────────────────────────────────────────────────────

/**
 * POST /api/auth/pin
 * Body: { pin: string, stationId: number }
 * Validates PIN against config table, creates anonymous session.
 */
export async function handlePinAuth(request: Request, env: Env): Promise<Response> {
  try {
    // MEDIUM-4: Rate limit PIN attempts by IP
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const allowed = await checkPinRateLimit(env, ip);
    if (!allowed) {
      return tooManyRequests('Too many PIN attempts. Please try again later.');
    }

    const body = (await request.json()) as { pin?: string; stationId?: number };

    if (!body.pin || body.stationId == null) {
      return badRequest('pin and stationId are required');
    }

    const pin = String(body.pin);
    const stationId = Number(body.stationId);

    // Validate station exists
    const station = await env.DB.prepare('SELECT id, name FROM stations WHERE id = ? AND is_active = 1')
      .bind(stationId)
      .first<{ id: number; name: string }>();

    if (!station) {
      return badRequest('Invalid station');
    }

    // Get the configured PIN from config table
    const configRow = await env.DB.prepare('SELECT value FROM config WHERE key = ?')
      .bind('station_pin')
      .first<{ value: string }>();

    const configPin = configRow?.value ?? env.STATION_PIN;

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeEqual(pin, configPin)) {
      return unauthorized('Invalid PIN');
    }

    // Create/find a PIN user for this station
    const userName = `PIN User - ${station.name}`;
    let user = await env.DB.prepare(
      'SELECT id, name, role, station_id FROM users WHERE name = ? AND auth_method = ? AND station_id = ?',
    )
      .bind(userName, 'pin', stationId)
      .first<{ id: number; name: string; role: string; station_id: number | null }>();

    if (!user) {
      const result = await env.DB.prepare('INSERT INTO users (name, role, auth_method, station_id) VALUES (?, ?, ?, ?)')
        .bind(userName, 'crew', 'pin', stationId)
        .run();
      user = {
        id: result.meta.last_row_id as number,
        name: userName,
        role: 'crew',
        station_id: stationId,
      };
    }

    // Update last_login_at
    await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run();

    // Create session (24h TTL for PIN)
    const { sessionId, session } = await createSession(env, {
      userId: user.id,
      email: null,
      name: user.name,
      role: user.role as 'crew' | 'logistics' | 'admin',
      stationId,
      authMethod: 'pin',
    });

    const cookie = buildSessionCookie(sessionId, 'pin');
    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          stationId,
        },
        expiresAt: session.expiresAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookie,
        },
      },
    );
  } catch (err) {
    console.error('[handlePinAuth]', err);
    return serverError('PIN auth failed');
  }
}
