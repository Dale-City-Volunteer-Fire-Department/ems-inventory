import { describe, it, expect } from 'vitest';
import { createMockKV } from '../helpers/mocks';
import { checkPinRateLimit } from '../../src/worker/auth/pin';

// ── Tests ────────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  describe('PIN rate limiting (10 per 5 min per IP)', () => {
    it('allows the first attempt for an IP', async () => {
      const kv = createMockKV();
      const allowed = await checkPinRateLimit(kv, '192.168.1.1');
      expect(allowed).toBe(true);
    });

    it('allows up to 10 attempts for the same IP', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 10; i++) {
        const allowed = await checkPinRateLimit(kv, '192.168.1.1');
        expect(allowed).toBe(true);
      }
    });

    it('10th attempt for same IP succeeds', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 9; i++) {
        await checkPinRateLimit(kv, '192.168.1.1');
      }
      const tenth = await checkPinRateLimit(kv, '192.168.1.1');
      expect(tenth).toBe(true);
    });

    it('11th attempt for same IP returns false (rate limited)', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 10; i++) {
        await checkPinRateLimit(kv, '192.168.1.1');
      }
      const eleventh = await checkPinRateLimit(kv, '192.168.1.1');
      expect(eleventh).toBe(false);
    });

    it('different IPs have independent rate limits', async () => {
      const kv = createMockKV();
      // Exhaust limit for IP 1
      for (let i = 0; i < 10; i++) {
        await checkPinRateLimit(kv, '10.0.0.1');
      }
      expect(await checkPinRateLimit(kv, '10.0.0.1')).toBe(false);

      // IP 2 should still be allowed
      const allowed = await checkPinRateLimit(kv, '10.0.0.2');
      expect(allowed).toBe(true);
    });

    it('rate limit counter is stored in KV with correct key format', async () => {
      const kv = createMockKV();
      await checkPinRateLimit(kv, '172.16.0.5');

      const stored = await kv.get('rate:pin:172.16.0.5', 'text');
      expect(stored).toBe('1');
    });

    it('counter increments correctly across attempts', async () => {
      const kv = createMockKV();
      for (let i = 1; i <= 5; i++) {
        await checkPinRateLimit(kv, '10.10.10.10');
        const stored = await kv.get('rate:pin:10.10.10.10', 'text');
        expect(stored).toBe(String(i));
      }
    });
  });
});
