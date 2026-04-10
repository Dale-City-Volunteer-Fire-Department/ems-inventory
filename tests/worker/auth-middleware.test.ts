import { describe, it, expect } from 'vitest';
import { createMockEnv, createMockKV, StatefulD1Mock } from '../helpers/mocks';
import { createSession } from '../../src/worker/auth/session';
import { requireAuth } from '../../src/worker/middleware/auth';
import type { UserRole } from '../../src/shared/types';

// ── Tests ────────────────────────────────────────────────────────────

describe('Auth Middleware — requireAuth', () => {
  it('returns 401 Response when no session', async () => {
    const env = createMockEnv();
    const request = new Request('https://emsinventory.dcvfd.org/api/items', {
      method: 'GET',
    });
    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it('returns 401 Response with "Authentication required" message', async () => {
    const env = createMockEnv();
    const request = new Request('https://emsinventory.dcvfd.org/api/items', {
      method: 'GET',
    });
    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    const body = await (result as Response).json() as { error: string };
    expect(body.error).toBe('Authentication required');
  });

  it('returns Session object when session is valid', async () => {
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 1 }]);

    const kv = createMockKV();
    const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

    const { sessionId } = await createSession(env, {
      userId: 5,
      email: 'logistics@dcvfd.org',
      name: 'Logistics Lead',
      role: 'logistics' as UserRole,
      stationId: 13,
      authMethod: 'magic_link',
    });

    const request = new Request('https://emsinventory.dcvfd.org/api/orders', {
      method: 'GET',
      headers: { Cookie: `ems_session=${sessionId}` },
    });

    const result = await requireAuth(request, env);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { userId: number }).userId).toBe(5);
    expect((result as { role: string }).role).toBe('logistics');
  });

  it('returns 401 for deactivated user', async () => {
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT is_active FROM users WHERE id', () => [{ is_active: 0 }]);

    const kv = createMockKV();
    const env = createMockEnv({ DB: d1Mock.asD1(), SESSIONS: kv });

    const { sessionId } = await createSession(env, {
      userId: 3,
      email: 'removed@dcvfd.org',
      name: 'Removed',
      role: 'crew' as UserRole,
      stationId: 10,
      authMethod: 'pin',
    });

    const request = new Request('https://emsinventory.dcvfd.org/api/items', {
      method: 'GET',
      headers: { Cookie: `ems_session=${sessionId}` },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it('returns 401 for invalid session ID', async () => {
    const env = createMockEnv();
    const request = new Request('https://emsinventory.dcvfd.org/api/items', {
      method: 'GET',
      headers: { Cookie: 'ems_session=totally-bogus-session-id' },
    });

    const result = await requireAuth(request, env);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});
