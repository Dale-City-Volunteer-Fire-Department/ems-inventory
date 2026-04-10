import { describe, it, expect } from 'vitest';
import { createMockKV } from '../helpers/mocks';
import { checkMagicLinkRateLimit } from '../../src/worker/auth/magic-link';
import { checkPinRateLimit } from '../../src/worker/auth/pin';

// ── Tests ────────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  describe('magic link rate limiting (5 per 15 min per email)', () => {
    it('allows the first request for an email', async () => {
      const kv = createMockKV();
      const allowed = await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      expect(allowed).toBe(true);
    });

    it('allows up to 5 requests for the same email', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 5; i++) {
        const allowed = await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
        expect(allowed).toBe(true);
      }
    });

    it('5th request for same email succeeds', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 4; i++) {
        await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      }
      const fifth = await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      expect(fifth).toBe(true);
    });

    it('6th request for same email returns false (rate limited)', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 5; i++) {
        await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      }
      const sixth = await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      expect(sixth).toBe(false);
    });

    it('7th and subsequent requests remain rate limited', async () => {
      const kv = createMockKV();
      for (let i = 0; i < 5; i++) {
        await checkMagicLinkRateLimit(kv, 'user@pwcgov.org');
      }
      expect(await checkMagicLinkRateLimit(kv, 'user@pwcgov.org')).toBe(false);
      expect(await checkMagicLinkRateLimit(kv, 'user@pwcgov.org')).toBe(false);
    });

    it('different emails have independent rate limits', async () => {
      const kv = createMockKV();
      // Exhaust limit for user1
      for (let i = 0; i < 5; i++) {
        await checkMagicLinkRateLimit(kv, 'user1@pwcgov.org');
      }
      expect(await checkMagicLinkRateLimit(kv, 'user1@pwcgov.org')).toBe(false);

      // user2 should still be allowed
      const allowed = await checkMagicLinkRateLimit(kv, 'user2@pwcgov.org');
      expect(allowed).toBe(true);
    });

    it('rate limit counter is stored in KV with correct key format', async () => {
      const kv = createMockKV();
      await checkMagicLinkRateLimit(kv, 'test@pwcgov.org');

      // Verify the key was stored
      const stored = await kv.get('rate:magic:test@pwcgov.org', 'text');
      expect(stored).toBe('1');
    });

    it('counter increments correctly across requests', async () => {
      const kv = createMockKV();
      await checkMagicLinkRateLimit(kv, 'counter@pwcgov.org');
      expect(await kv.get('rate:magic:counter@pwcgov.org', 'text')).toBe('1');

      await checkMagicLinkRateLimit(kv, 'counter@pwcgov.org');
      expect(await kv.get('rate:magic:counter@pwcgov.org', 'text')).toBe('2');

      await checkMagicLinkRateLimit(kv, 'counter@pwcgov.org');
      expect(await kv.get('rate:magic:counter@pwcgov.org', 'text')).toBe('3');
    });
  });

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

  describe('rate limit isolation between magic link and PIN', () => {
    it('magic link and PIN counters are independent for the same identifier', async () => {
      const kv = createMockKV();

      // Use the same string as both email and IP (edge case)
      for (let i = 0; i < 5; i++) {
        await checkMagicLinkRateLimit(kv, 'shared@pwcgov.org');
      }
      // Magic link is now rate limited
      expect(await checkMagicLinkRateLimit(kv, 'shared@pwcgov.org')).toBe(false);

      // PIN uses a different key prefix, so it should still work
      const pinAllowed = await checkPinRateLimit(kv, 'shared@pwcgov.org');
      expect(pinAllowed).toBe(true);
    });

    it('KV keys use different prefixes: rate:magic: vs rate:pin:', async () => {
      const kv = createMockKV();
      await checkMagicLinkRateLimit(kv, 'test@pwcgov.org');
      await checkPinRateLimit(kv, '192.168.1.1');

      expect(await kv.get('rate:magic:test@pwcgov.org', 'text')).toBe('1');
      expect(await kv.get('rate:pin:192.168.1.1', 'text')).toBe('1');

      // Cross-check: wrong prefix returns null
      expect(await kv.get('rate:pin:test@pwcgov.org', 'text')).toBeNull();
      expect(await kv.get('rate:magic:192.168.1.1', 'text')).toBeNull();
    });
  });
});
