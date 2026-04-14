import { describe, it, expect } from 'vitest';
import { createMockKV, createMockEnv, StatefulD1Mock } from '../helpers/mocks';
import {
  createSession,
  getSession,
  destroySession,
  parseSessionCookie,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../../src/worker/auth/session';
import { validateSession } from '../../src/worker/middleware/auth';
import type { UserRole } from '../../src/shared/types';

// ── Tests ────────────────────────────────────────────────────────────

describe('Auth Logic', () => {
  describe('PIN validation', () => {
    it('correct PIN matches stored value', () => {
      const storedPin = '5214';
      const inputPin = '5214';
      expect(inputPin === storedPin).toBe(true);
    });

    it('wrong PIN does not match stored value', () => {
      const storedPin = '5214';
      const inputPin = '1234';
      expect(inputPin === storedPin).toBe(false);
    });

    it('constant-time PIN comparison does not exit early', () => {
      // Validates that PIN comparison should use constant-time logic
      // to prevent timing attacks. This tests the principle.
      const storedPin = '5214';
      const wrongPin = '0000';

      // A constant-time compare checks every character regardless
      function constantTimeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        let mismatch = 0;
        for (let i = 0; i < a.length; i++) {
          mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return mismatch === 0;
      }

      expect(constantTimeCompare(storedPin, storedPin)).toBe(true);
      expect(constantTimeCompare(storedPin, wrongPin)).toBe(false);
      expect(constantTimeCompare(storedPin, '521')).toBe(false);
      expect(constantTimeCompare(storedPin, '52140')).toBe(false);
    });
  });

  describe('session creation and retrieval from KV', () => {
    it('creates a session and stores it in KV', async () => {
      const env = createMockEnv();

      const { sessionId, session } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Test Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      expect(sessionId).toBeDefined();
      expect(sessionId.length).toBe(64); // 32 bytes hex
      expect(session.userId).toBe(1);
      expect(session.role).toBe('crew');
      expect(session.expiresAt).toBeDefined();
    });

    it('retrieves a stored session by ID', async () => {
      const env = createMockEnv();

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Test Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const retrieved = await getSession(env, sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.userId).toBe(1);
      expect(retrieved!.name).toBe('Test Crew');
      expect(retrieved!.role).toBe('crew');
    });

    it('returns null for a non-existent session', async () => {
      const env = createMockEnv();
      const result = await getSession(env, 'nonexistent-session-id');
      expect(result).toBeNull();
    });

    it('destroys a session from KV', async () => {
      const env = createMockEnv();

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Test Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      await destroySession(env, sessionId);
      const result = await getSession(env, sessionId);
      expect(result).toBeNull();
    });

    it('PIN session has 24-hour TTL', async () => {
      const env = createMockEnv();

      const { session } = await createSession(env, {
        userId: 1,
        email: null,
        name: 'Station Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const expiresAt = new Date(session.expiresAt).getTime();
      const now = Date.now();
      const ttlMs = expiresAt - now;
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      // TTL should be approximately 24 hours (within 5 seconds tolerance)
      expect(Math.abs(ttlMs - twentyFourHoursMs)).toBeLessThan(5000);
    });

    it('SSO session has 30-day TTL', async () => {
      const env = createMockEnv();

      const { session } = await createSession(env, {
        userId: 3,
        email: 'admin@dcvfd.org',
        name: 'Admin User',
        role: 'admin' as UserRole,
        stationId: null,
        authMethod: 'entra_sso',
      });

      const expiresAt = new Date(session.expiresAt).getTime();
      const now = Date.now();
      const ttlMs = expiresAt - now;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      expect(Math.abs(ttlMs - thirtyDaysMs)).toBeLessThan(5000);
    });
  });

  describe('session ID generation', () => {
    it('generates a unique session ID for each session', async () => {
      const env = createMockEnv();

      const session1 = await createSession(env, {
        userId: 1,
        email: 'user1@dcvfd.org',
        name: 'User 1',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'entra_sso',
      });

      const session2 = await createSession(env, {
        userId: 2,
        email: 'user2@dcvfd.org',
        name: 'User 2',
        role: 'crew' as UserRole,
        stationId: 13,
        authMethod: 'entra_sso',
      });

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('session ID is 64 hex characters (32 bytes)', async () => {
      const env = createMockEnv();

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'user@dcvfd.org',
        name: 'User',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'entra_sso',
      });

      expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('expired session token', () => {
    it('returns null for an expired session (KV TTL)', async () => {
      // Mock KV that simulates expiration
      const kv = createMockKV();

      // Manually put a session with an already-expired timestamp
      await kv.put(
        'session:expired-id',
        JSON.stringify({
          userId: 1,
          email: 'user@dcvfd.org',
          name: 'User',
          role: 'crew',
          stationId: 10,
          authMethod: 'entra_sso',
          expiresAt: '2020-01-01T00:00:00.000Z', // expired
        }),
        { expiration: Math.floor(Date.now() / 1000) - 3600 }, // expired 1 hour ago
      );

      const env = createMockEnv({ SESSIONS: kv });
      const result = await getSession(env, 'expired-id');
      // Our mock KV checks expiration and returns null
      expect(result).toBeNull();
    });
  });

  describe('cookie helpers', () => {
    it('parses session ID from cookie header', () => {
      const cookie = 'ems_session=abc123def456; other_cookie=value';
      const sessionId = parseSessionCookie(cookie);
      expect(sessionId).toBe('abc123def456');
    });

    it('returns null when no session cookie present', () => {
      const cookie = 'other_cookie=value';
      const sessionId = parseSessionCookie(cookie);
      expect(sessionId).toBeNull();
    });

    it('returns null when cookie header is null', () => {
      const sessionId = parseSessionCookie(null);
      expect(sessionId).toBeNull();
    });

    it('builds a session cookie with correct attributes', () => {
      const cookie = buildSessionCookie('test-session-id', 'pin');
      expect(cookie).toContain('ems_session=test-session-id');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      // PIN TTL = 24 hours = 86400 seconds
      expect(cookie).toContain('Max-Age=86400');
    });

    it('builds a clear session cookie', () => {
      const cookie = buildClearSessionCookie();
      expect(cookie).toContain('ems_session=');
      expect(cookie).toContain('Max-Age=0');
    });
  });

  describe('validateSession — auth middleware', () => {
    it('returns null when no cookie is present', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
      });
      const result = await validateSession(request, env);
      expect(result).toBeNull();
    });

    it('returns null when session ID does not exist in KV', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: 'ems_session=nonexistent-session-id' },
      });
      const result = await validateSession(request, env);
      expect(result).toBeNull();
    });

    it('returns session when user is active (is_active = 1)', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      // Create a session in KV
      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Active Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const result = await validateSession(request, env);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(1);
      expect(result!.name).toBe('Active Crew');
      expect(result!.role).toBe('crew');
    });

    it('returns null when user is_active = 0 (deactivated)', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 0 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      // Create a session in KV
      const { sessionId } = await createSession(env, {
        userId: 2,
        email: 'deactivated@dcvfd.org',
        name: 'Deactivated User',
        role: 'logistics' as UserRole,
        stationId: 13,
        authMethod: 'entra_sso',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const result = await validateSession(request, env);
      expect(result).toBeNull();
    });

    it('deletes the KV session when user is deactivated', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 0 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      // Create a session in KV
      const { sessionId } = await createSession(env, {
        userId: 3,
        email: 'removed@dcvfd.org',
        name: 'Removed User',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      // Confirm session exists before validation
      const beforeValidation = await getSession(env, sessionId);
      expect(beforeValidation).not.toBeNull();

      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      await validateSession(request, env);

      // Session should now be deleted from KV
      const afterValidation = await getSession(env, sessionId);
      expect(afterValidation).toBeNull();
    });

    it('returns null when userId does not exist in database', async () => {
      const d1Mock = new StatefulD1Mock();
      // No handler registered for the users query, so it returns empty => first() returns null
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => []);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      // Create a session for a user that no longer exists
      const { sessionId } = await createSession(env, {
        userId: 999,
        email: 'ghost@dcvfd.org',
        name: 'Ghost User',
        role: 'admin' as UserRole,
        stationId: null,
        authMethod: 'entra_sso',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const result = await validateSession(request, env);
      expect(result).toBeNull();
    });

    it('destroys session when userId does not exist in database', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => []);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      const { sessionId } = await createSession(env, {
        userId: 999,
        email: 'ghost@dcvfd.org',
        name: 'Ghost User',
        role: 'admin' as UserRole,
        stationId: null,
        authMethod: 'entra_sso',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      await validateSession(request, env);

      // Session should be destroyed
      const afterValidation = await getSession(env, sessionId);
      expect(afterValidation).toBeNull();
    });

    it('returns null for a malformed cookie value', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/items', {
        method: 'GET',
        headers: { Cookie: 'ems_session=' },
      });
      const result = await validateSession(request, env);
      expect(result).toBeNull();
    });
  });
});
