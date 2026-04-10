import { describe, it, expect } from 'vitest';
import { StatefulD1Mock, createMockEnv, createMockKV } from '../helpers/mocks';
import {
  createSession,
  destroySession,
  parseSessionCookie,
  buildClearSessionCookie,
} from '../../src/worker/auth/session';
import { handleAuthMe, handleAuthLogout } from '../../src/worker/auth/handlers';
import type { UserRole } from '../../src/shared/types';

// ── Tests ────────────────────────────────────────────────────────────

describe('Auth Handlers', () => {
  describe('handleAuthMe', () => {
    it('returns 401 when no session cookie present', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/auth/me', {
        method: 'GET',
      });

      const res = await handleAuthMe(request, env);
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('Authentication required');
    });

    it('returns 401 when session ID does not exist in KV', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/auth/me', {
        method: 'GET',
        headers: { Cookie: 'ems_session=nonexistent-session' },
      });

      const res = await handleAuthMe(request, env);
      expect(res.status).toBe(401);
    });

    it('returns 200 with session data for valid session', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Test Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const res = await handleAuthMe(request, env);
      expect(res.status).toBe(200);
      const body = await res.json() as { userId: number; name: string; role: string };
      expect(body.userId).toBe(1);
      expect(body.name).toBe('Test Crew');
      expect(body.role).toBe('crew');
    });

    it('returns photoUrl field in response', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'admin@dcvfd.org',
        name: 'Admin',
        role: 'admin' as UserRole,
        stationId: null,
        authMethod: 'entra_sso',
        photoUrl: 'https://graph.microsoft.com/photo.jpg',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const res = await handleAuthMe(request, env);
      const body = await res.json() as { photoUrl: string };
      expect(body.photoUrl).toBe('https://graph.microsoft.com/photo.jpg');
    });

    it('returns null photoUrl when not set', async () => {
      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

      const kv = createMockKV();
      const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: null,
        name: 'Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      const res = await handleAuthMe(request, env);
      const body = await res.json() as { photoUrl: string | null };
      expect(body.photoUrl).toBeNull();
    });
  });

  describe('handleAuthLogout', () => {
    it('returns 200 with logout message', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/auth/logout', {
        method: 'POST',
      });

      const res = await handleAuthLogout(request, env);
      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toBe('Logged out');
    });

    it('sets clear session cookie header', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: 'ems_session=some-session-id' },
      });

      const res = await handleAuthLogout(request, env);
      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('ems_session=');
      expect(setCookie).toContain('Max-Age=0');
    });

    it('destroys the session in KV', async () => {
      const kv = createMockKV();
      const env = createMockEnv({ SESSIONS: kv });

      const { sessionId } = await createSession(env, {
        userId: 1,
        email: 'crew@dcvfd.org',
        name: 'Crew',
        role: 'crew' as UserRole,
        stationId: 10,
        authMethod: 'pin',
      });

      const request = new Request('https://emsinventory.dcvfd.org/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: `ems_session=${sessionId}` },
      });

      await handleAuthLogout(request, env);

      // Session should be gone from KV
      const stored = await kv.get(`session:${sessionId}`, 'text');
      expect(stored).toBeNull();
    });

    it('handles logout gracefully when no session cookie', async () => {
      const env = createMockEnv();
      const request = new Request('https://emsinventory.dcvfd.org/api/auth/logout', {
        method: 'POST',
      });

      const res = await handleAuthLogout(request, env);
      expect(res.status).toBe(200);
    });
  });
});
