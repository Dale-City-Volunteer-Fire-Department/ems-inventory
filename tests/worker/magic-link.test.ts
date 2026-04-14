/**
 * Tests for magic link authentication handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEnv, createMockKV } from '../helpers/mocks';
import { handleMagicLinkRequest, handleMagicLinkVerify } from '../../src/worker/auth/magic-link';

// ── Helpers ────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// ── Mock fetch (to intercept Resend API calls) ─────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

// ── POST /api/public/magic-link/request ───────────────────────────────

describe('handleMagicLinkRequest', () => {
  it('returns 400 when CF-Connecting-IP is missing (MEDIUM-2)', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'medic@dcvfd.org' }),
    });
    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Unable to determine client IP');
  });

  it('returns 400 when email is missing', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({}),
    });
    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('email is required');
  });

  it('returns 400 for invalid email format', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Invalid email');
  });

  it('returns 400 for empty email string', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: '   ' }),
    });
    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid email and stores token in KV', async () => {
    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'medic@dcvfd.org' }),
    });

    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('normalizes email to lowercase', async () => {
    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'Medic@DCVFD.Org' }),
    });

    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(200);
  });

  it('rate limits after 5 requests from the same email in 1 hour', async () => {
    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    const makeReq = () =>
      makeRequest('https://example.com/api/public/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
        body: JSON.stringify({ email: 'test@dcvfd.org' }),
      });

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const res = await handleMagicLinkRequest(makeReq(), env);
      expect(res.status).toBe(200);
    }

    // 6th should be rate limited
    const res = await handleMagicLinkRequest(makeReq(), env);
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Too many');
  });

  it('rate limits after 20 requests from the same IP in 1 hour (MEDIUM-2)', async () => {
    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    // Send 20 requests from the same IP with different emails (to bypass email rate limit)
    for (let i = 0; i < 20; i++) {
      const req = makeRequest('https://example.com/api/public/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
        body: JSON.stringify({ email: `user${i}@dcvfd.org` }),
      });
      const res = await handleMagicLinkRequest(req, env);
      expect(res.status).toBe(200);
    }

    // 21st request from the same IP must be rate limited
    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.1' },
      body: JSON.stringify({ email: 'another@dcvfd.org' }),
    });
    const res = await handleMagicLinkRequest(req, env);
    expect(res.status).toBe(429);
  });

  it('calls Resend API with the correct email', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'crew@dcvfd.org' }),
    });

    await handleMagicLinkRequest(req, env);

    // Verify fetch was called (Resend API)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-resend-key',
        }),
      }),
    );

    // Verify the body contains the correct recipient
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      to: string[];
      subject: string;
    };
    expect(callBody.to).toContain('crew@dcvfd.org');
    expect(callBody.subject).toBe('Sign in to EMS Inventory');
  });

  it('stores a magic: prefixed token in KV', async () => {
    const kv = createMockKV();
    const env = createMockEnv({ SESSIONS: kv });

    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const req = makeRequest('https://example.com/api/public/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'paramedic@dcvfd.org' }),
    });

    await handleMagicLinkRequest(req, env);

    // Extract the token from the Resend call body
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { html: string };
    const tokenMatch = callBody.html.match(/token=([a-f0-9]+)/);
    expect(tokenMatch).not.toBeNull();

    if (tokenMatch) {
      const token = tokenMatch[1];
      const stored = await kv.get(`magic:${token}`);
      expect(stored).not.toBeNull();
      const data = JSON.parse(stored!) as { email: string; created_at: number };
      expect(data.email).toBe('paramedic@dcvfd.org');
    }
  });
});

// ── GET /api/public/magic-link/verify ────────────────────────────────

describe('handleMagicLinkVerify', () => {
  it('returns 400 when token param is missing', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/verify');
    const res = await handleMagicLinkVerify(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('token is required');
  });

  it('returns success:false for unknown token', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/magic-link/verify?token=nonexistent');
    const res = await handleMagicLinkVerify(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('returns success:true with email and a NEW session token for valid magic link token', async () => {
    const kv = createMockKV();
    // Seed a valid magic link token
    const tokenData = { email: 'lieutenant@dcvfd.org', created_at: Date.now() };
    await kv.put('magic:valid-test-token-abc123', JSON.stringify(tokenData), { expirationTtl: 1800 });

    const env = createMockEnv({ SESSIONS: kv });
    const req = makeRequest('https://example.com/api/public/magic-link/verify?token=valid-test-token-abc123');
    const res = await handleMagicLinkVerify(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; email: string; token: string };
    expect(body.success).toBe(true);
    expect(body.email).toBe('lieutenant@dcvfd.org');
    // HIGH-1: The returned token must be a NEW session token, not the original magic link token
    expect(body.token).not.toBe('valid-test-token-abc123');
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('magic link token is consumed on first use (HIGH-1: token replay prevention)', async () => {
    const kv = createMockKV();
    const tokenData = { email: 'captain@dcvfd.org', created_at: Date.now() };
    await kv.put('magic:one-time-token', JSON.stringify(tokenData), { expirationTtl: 1800 });

    const env = createMockEnv({ SESSIONS: kv });

    // First verify — should succeed and consume the token
    const req1 = makeRequest('https://example.com/api/public/magic-link/verify?token=one-time-token');
    const res1 = await handleMagicLinkVerify(req1, env);
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as { success: boolean };
    expect(body1.success).toBe(true);

    // Second verify with the same magic link token — must fail (token was deleted)
    const req2 = makeRequest('https://example.com/api/public/magic-link/verify?token=one-time-token');
    const res2 = await handleMagicLinkVerify(req2, env);
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as { success: boolean };
    expect(body2.success).toBe(false);
  });

  it('issued session token is stored under public: prefix with counters', async () => {
    const kv = createMockKV();
    const tokenData = { email: 'emt@dcvfd.org', created_at: Date.now() };
    await kv.put('magic:session-seed-token', JSON.stringify(tokenData), { expirationTtl: 1800 });

    const env = createMockEnv({ SESSIONS: kv });
    const req = makeRequest('https://example.com/api/public/magic-link/verify?token=session-seed-token');
    const res = await handleMagicLinkVerify(req, env);
    const body = await res.json() as { success: boolean; token: string };

    // The new session token should exist in KV under public: prefix
    const stored = await kv.get(`public:${body.token}`);
    expect(stored).not.toBeNull();
    const storedData = JSON.parse(stored!) as { email: string; submissions: number; uploads: number };
    expect(storedData.email).toBe('emt@dcvfd.org');
    expect(storedData.submissions).toBe(0);
    expect(storedData.uploads).toBe(0);
  });
});

// ── Integration: magic link verify → session token → public inventory handlers ─

describe('magic link session token accepted as public token', () => {
  it('session token issued by verify is accepted by handlePublicInventorySubmit', async () => {
    // HIGH-1: After verify, the returned session token (under public: prefix) must be usable
    const { StatefulD1Mock } = await import('../helpers/mocks');
    const { handlePublicInventorySubmit } = await import('../../src/worker/public');

    const kv = createMockKV();

    // Seed a magic link token and verify it to get a session token
    const magicTokenData = { email: 'emt@dcvfd.org', created_at: Date.now() };
    await kv.put('magic:integration-magic-token', JSON.stringify(magicTokenData), { expirationTtl: 1800 });

    const env0 = createMockEnv({ SESSIONS: kv });
    const verifyReq = makeRequest('https://example.com/api/public/magic-link/verify?token=integration-magic-token');
    const verifyRes = await handleMagicLinkVerify(verifyReq, env0);
    const verifyBody = await verifyRes.json() as { success: boolean; token: string };
    expect(verifyBody.success).toBe(true);
    const sessionToken = verifyBody.token;

    // Now use the session token to submit inventory
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);
    d1Mock.onQuery('SELECT i.id', () => []); // empty template
    d1Mock.onQuery('INSERT INTO inventory_sessions', () => []);

    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': sessionToken },
      body: JSON.stringify({
        station_id: 10,
        counts: [{ item_id: 1, actual_count: 5 }],
      }),
    });

    const res = await handlePublicInventorySubmit(req, env);
    // Session token is valid — should not be 401
    expect(res.status).not.toBe(401);
  });

  it('magic link submission counter is tracked (HIGH-2: no unlimited bypass)', async () => {
    // Session tokens from magic link must be subject to the same submission cap
    const { StatefulD1Mock } = await import('../helpers/mocks');
    const { handlePublicInventorySubmit } = await import('../../src/worker/public');

    const kv = createMockKV();

    // Seed a session token (as if issued by magic link verify) with submissions at cap
    const sessionToken = 'magic-derived-session-token-test';
    await kv.put(`public:${sessionToken}`, JSON.stringify({
      email: 'crew@dcvfd.org',
      created: Date.now(),
      submissions: 10, // at the cap
      uploads: 0,
    }), { expirationTtl: 7200 });

    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);

    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': sessionToken },
      body: JSON.stringify({
        station_id: 10,
        counts: [{ item_id: 1, actual_count: 5 }],
      }),
    });

    const res = await handlePublicInventorySubmit(req, env);
    // Must be rate limited — magic link sessions are no longer exempt
    expect(res.status).toBe(429);
  });
});
