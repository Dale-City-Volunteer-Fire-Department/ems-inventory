import type { Env } from '../types';
import type { UserRole } from '../../shared/types';

// ── Session types ──────────────────────────────────────────────────

export interface Session {
  userId: number;
  email: string | null;
  name: string;
  role: UserRole;
  stationId: number | null;
  authMethod: 'entra_sso' | 'magic_link' | 'pin';
  photoUrl?: string | null;
  expiresAt: string; // ISO timestamp
}

// ── TTLs ───────────────────────────────────────────────────────────

/** 30 days in seconds */
const SSO_TTL = 30 * 24 * 60 * 60;
/** 30 days in seconds */
const MAGIC_LINK_TTL = 30 * 24 * 60 * 60;
/** 24 hours in seconds */
const PIN_TTL = 24 * 60 * 60;

function ttlForMethod(authMethod: Session['authMethod']): number {
  switch (authMethod) {
    case 'entra_sso':
      return SSO_TTL;
    case 'magic_link':
      return MAGIC_LINK_TTL;
    case 'pin':
      return PIN_TTL;
  }
}

// ── Session CRUD ───────────────────────────────────────────────────

/** Generate a cryptographically random session ID */
function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Create a new session in KV and return the session ID */
export async function createSession(
  env: Env,
  data: Omit<Session, 'expiresAt'>,
): Promise<{ sessionId: string; session: Session }> {
  const ttl = ttlForMethod(data.authMethod);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const session: Session = { ...data, expiresAt };
  const sessionId = generateSessionId();

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });

  return { sessionId, session };
}

/** Read a session from KV (returns null if expired or missing) */
export async function getSession(env: Env, sessionId: string): Promise<Session | null> {
  const raw = await env.SESSIONS.get(`session:${sessionId}`, 'text');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** Delete a session from KV */
export async function destroySession(env: Env, sessionId: string): Promise<void> {
  await env.SESSIONS.delete(`session:${sessionId}`);
}

// ── Cookie helpers ─────────────────────────────────────────────────

const COOKIE_NAME = 'ems_session';

/** Parse the session ID from the Cookie header */
export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

/** Build a Set-Cookie header value for the session */
export function buildSessionCookie(sessionId: string, authMethod: Session['authMethod']): string {
  const maxAge = ttlForMethod(authMethod);
  return `${COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** Build a Set-Cookie header that clears the session cookie */
export function buildClearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
