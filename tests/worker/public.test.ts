/**
 * Tests for public inventory handlers — security fixes validation
 */

import { describe, it, expect } from 'vitest';
import { createMockEnv, createMockKV, createMockR2, StatefulD1Mock } from '../helpers/mocks';
import {
  handlePublicVerifyPin,
  handlePublicUpload,
  handlePublicInventorySubmit,
  handlePublicGetInventory,
} from '../../src/worker/public';

// ── Helpers ────────────────────────────────────────────────────────────

/** Seed a valid public token in KV and return the token string */
async function seedToken(
  kv: KVNamespace,
  overrides?: Partial<{ submissions: number; uploads: number }>,
): Promise<string> {
  const token = 'test-token-abcdef1234567890';
  const data = { created: Date.now(), submissions: overrides?.submissions ?? 0, uploads: overrides?.uploads ?? 0 };
  await kv.put(`public:${token}`, JSON.stringify(data), { expirationTtl: 7200 });
  return token;
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// ── H-4: Unknown IP rejection ──────────────────────────────────────────

describe('H-4: IP validation', () => {
  it('handlePublicVerifyPin returns 400 when CF-Connecting-IP is missing', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '5214' }),
    });
    const res = await handlePublicVerifyPin(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Unable to determine client IP');
  });

  it('handlePublicVerifyPin returns 400 when CF-Connecting-IP is "unknown"', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'unknown' },
      body: JSON.stringify({ pin: '5214' }),
    });
    const res = await handlePublicVerifyPin(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Unable to determine client IP');
  });

  it('handlePublicVerifyPin proceeds when valid IP is provided', async () => {
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT value FROM config WHERE key', () => []);
    const env = createMockEnv({ DB: d1Mock.asD1() });

    const req = makeRequest('https://example.com/api/public/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ pin: '5214' }), // matches STATION_PIN default in mock env
    });
    const res = await handlePublicVerifyPin(req, env);
    // Should not be 400 (IP rejection) — may be 200 (success) or 401 (wrong pin)
    expect(res.status).not.toBe(400);
  });
});

// ── H-2: Token rate limiting ───────────────────────────────────────────

describe('H-2: Token rate limiting', () => {
  describe('submit cap (10 per token)', () => {
    it('returns 429 when submission count is at cap', async () => {
      const kv = createMockKV();
      const token = await seedToken(kv, { submissions: 10 });

      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);

      const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });
      const req = makeRequest('https://example.com/api/public/inventory/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
        body: JSON.stringify({
          station_id: 10,
          counts: [{ item_id: 1, actual_count: 5 }],
        }),
      });
      const res = await handlePublicInventorySubmit(req, env);
      expect(res.status).toBe(429);
    });

    it('allows submission when under cap', async () => {
      const kv = createMockKV();
      const token = await seedToken(kv, { submissions: 0 });

      const d1Mock = new StatefulD1Mock();
      d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);
      d1Mock.onQuery('SELECT i.id', () => []); // getInventoryTemplate returns empty
      d1Mock.onQuery('INSERT INTO inventory_sessions', () => []);

      const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });
      const req = makeRequest('https://example.com/api/public/inventory/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
        body: JSON.stringify({
          station_id: 10,
          counts: [{ item_id: 1, actual_count: 5 }],
        }),
      });
      const res = await handlePublicInventorySubmit(req, env);
      // Not 429 — either 200 or other validation error
      expect(res.status).not.toBe(429);
    });
  });

  describe('upload cap (50 per token)', () => {
    it('returns 429 when upload count is at cap', async () => {
      const kv = createMockKV();
      const token = await seedToken(kv, { uploads: 50 });
      const env = createMockEnv({ SESSIONS: kv });

      const file = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], 'test.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);

      const req = makeRequest('https://example.com/api/public/upload', {
        method: 'POST',
        headers: { 'X-Public-Token': token },
        body: formData,
      });
      const res = await handlePublicUpload(req, env);
      expect(res.status).toBe(429);
    });
  });

  describe('token validation with JSON format', () => {
    it('returns 401 with no token', async () => {
      const env = createMockEnv();
      const req = makeRequest('https://example.com/api/public/upload', {
        method: 'POST',
      });
      const res = await handlePublicUpload(req, env);
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const env = createMockEnv();
      const req = makeRequest('https://example.com/api/public/upload', {
        method: 'POST',
        headers: { 'X-Public-Token': 'not-a-real-token' },
      });
      const res = await handlePublicUpload(req, env);
      expect(res.status).toBe(401);
    });

    it('accepts token stored as legacy "1" value (does not return 401)', async () => {
      const kv = createMockKV();
      // Legacy format — just '1'
      await kv.put('public:legacy-token', '1', { expirationTtl: 7200 });
      const env = createMockEnv({ SESSIONS: kv });

      // Use a proper multipart form request with a valid file so we can reach past token check
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      const file = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);

      const req = makeRequest('https://example.com/api/public/upload', {
        method: 'POST',
        headers: { 'X-Public-Token': 'legacy-token' },
        body: formData,
      });
      // Token is accepted — upload proceeds (magic bytes check on 4 bytes may pass or fail, but NOT 401)
      const res = await handlePublicUpload(req, env);
      expect(res.status).not.toBe(401);
    });
  });
});

// ── H-1: Attachment metadata validation ───────────────────────────────

describe('H-1: Attachment validation in submit', () => {
  it('rejects attachment with invalid r2_key pattern', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);

    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });
    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify({
        station_id: 10,
        counts: [{ item_id: 1, actual_count: 5 }],
        attachments: [{ r2_key: '../evil/path', filename: 'x.jpg', content_type: 'image/jpeg', size_bytes: 100 }],
      }),
    });
    const res = await handlePublicInventorySubmit(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Invalid attachment key format');
  });

  it('rejects attachment when r2 head() returns null', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);

    // R2 mock that returns null for head()
    const emptyR2 = createMockR2();
    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1(), ATTACHMENTS: emptyR2 });

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify({
        station_id: 10,
        counts: [{ item_id: 1, actual_count: 5 }],
        attachments: [{ r2_key: 'attachments/abc123/photo.jpg', filename: 'photo.jpg', content_type: 'image/jpeg', size_bytes: 1000 }],
      }),
    });
    const res = await handlePublicInventorySubmit(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not found in storage');
  });

  it('rejects more than 10 attachments', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);

    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });
    const attachments = Array.from({ length: 11 }, (_, i) => ({
      r2_key: `attachments/abc${i}/file.jpg`,
      filename: `file${i}.jpg`,
      content_type: 'image/jpeg',
      size_bytes: 100,
    }));

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify({
        station_id: 10,
        counts: [{ item_id: 1, actual_count: 5 }],
        attachments,
      }),
    });
    const res = await handlePublicInventorySubmit(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Too many attachments');
  });
});

// ── M-1: Magic-byte validation ────────────────────────────────────────

describe('M-1: Magic-byte file validation', () => {
  it('rejects a file whose bytes do not match declared JPEG type', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const env = createMockEnv({ SESSIONS: kv });

    // PNG magic bytes declared as JPEG
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const file = new File([pngBytes], 'fake.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', file);

    const req = makeRequest('https://example.com/api/public/upload', {
      method: 'POST',
      headers: { 'X-Public-Token': token },
      body: formData,
    });
    const res = await handlePublicUpload(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('does not match declared type');
  });

  it('accepts a valid JPEG file', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const r2 = createMockR2();
    const env = createMockEnv({ SESSIONS: kv, ATTACHMENTS: r2 });

    // Valid JPEG magic bytes
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const file = new File([jpegBytes], 'photo.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', file);

    const req = makeRequest('https://example.com/api/public/upload', {
      method: 'POST',
      headers: { 'X-Public-Token': token },
      body: formData,
    });
    const res = await handlePublicUpload(req, env);
    expect(res.status).toBe(200);
  });

  it('accepts a valid PNG file', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const r2 = createMockR2();
    const env = createMockEnv({ SESSIONS: kv, ATTACHMENTS: r2 });

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const file = new File([pngBytes], 'photo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', file);

    const req = makeRequest('https://example.com/api/public/upload', {
      method: 'POST',
      headers: { 'X-Public-Token': token },
      body: formData,
    });
    const res = await handlePublicUpload(req, env);
    expect(res.status).toBe(200);
  });
});

// ── M-3: Length caps ─────────────────────────────────────────────────

describe('M-3: Length caps on notes and submitter_name', () => {
  async function submitWithBody(body: object): Promise<Response> {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);
    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify(body),
    });
    return handlePublicInventorySubmit(req, env);
  }

  it('rejects notes longer than 2000 characters', async () => {
    const res = await submitWithBody({
      station_id: 10,
      counts: [{ item_id: 1, actual_count: 5 }],
      notes: 'x'.repeat(2001),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('notes');
  });

  it('accepts notes at exactly 2000 characters', async () => {
    const res = await submitWithBody({
      station_id: 10,
      counts: [{ item_id: 1, actual_count: 5 }],
      notes: 'x'.repeat(2000),
    });
    expect(res.status).not.toBe(400);
  });

  it('rejects submitter_name longer than 100 characters', async () => {
    const res = await submitWithBody({
      station_id: 10,
      counts: [{ item_id: 1, actual_count: 5 }],
      submitter_name: 'x'.repeat(101),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('submitter_name');
  });

  it('accepts submitter_name at exactly 100 characters', async () => {
    const res = await submitWithBody({
      station_id: 10,
      counts: [{ item_id: 1, actual_count: 5 }],
      submitter_name: 'x'.repeat(100),
    });
    expect(res.status).not.toBe(400);
  });
});

// ── M-4: Integer and upper bound validation ───────────────────────────

describe('M-4: Integer-only and upper bound on counts', () => {
  async function submitCounts(counts: { item_id: number; actual_count: number }[]): Promise<Response> {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT id, name FROM stations WHERE id', () => [{ id: 10, name: 'Station 10' }]);
    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });

    const req = makeRequest('https://example.com/api/public/inventory/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify({ station_id: 10, counts }),
    });
    return handlePublicInventorySubmit(req, env);
  }

  it('rejects non-integer actual_count', async () => {
    const res = await submitCounts([{ item_id: 1, actual_count: 3.5 }]);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('integer');
  });

  it('rejects actual_count above 9999', async () => {
    const res = await submitCounts([{ item_id: 1, actual_count: 10000 }]);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('9999');
  });

  it('accepts valid integer count at boundary (9999)', async () => {
    const res = await submitCounts([{ item_id: 1, actual_count: 9999 }]);
    // Should not be rejected by count validation (may fail for other reasons in mock)
    expect(res.status).not.toBe(400);
  });

  it('accepts zero as a valid count', async () => {
    const res = await submitCounts([{ item_id: 1, actual_count: 0 }]);
    expect(res.status).not.toBe(400);
  });
});

// ── H-3: Public inventory GET endpoint ───────────────────────────────

describe('H-3: GET /api/public/inventory/:stationId', () => {
  it('returns 401 without token', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/inventory/10');
    const res = await handlePublicGetInventory(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const env = createMockEnv();
    const req = makeRequest('https://example.com/api/public/inventory/10', {
      headers: { 'X-Public-Token': 'bad-token' },
    });
    const res = await handlePublicGetInventory(req, env);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid station ID', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);
    const env = createMockEnv({ SESSIONS: kv });

    const req = makeRequest('https://example.com/api/public/inventory/abc', {
      headers: { 'X-Public-Token': token },
    });
    const res = await handlePublicGetInventory(req, env);
    expect(res.status).toBe(400);
  });

  it('returns items when valid token and station provided', async () => {
    const kv = createMockKV();
    const token = await seedToken(kv);

    const d1Mock = new StatefulD1Mock();
    d1Mock.onQuery('SELECT i.id', () => [
      { item_id: 1, item_name: 'NPA Kit', category: 'Airway', sort_order: 0, target_count: 4 },
    ]);

    const env = createMockEnv({ SESSIONS: kv, DB: d1Mock.asD1() });
    const req = makeRequest('https://example.com/api/public/inventory/10', {
      headers: { 'X-Public-Token': token },
    });
    const res = await handlePublicGetInventory(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ item_id: number; name: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe('NPA Kit');
  });
});
