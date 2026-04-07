import { describe, it, expect } from 'vitest';

// ── Email domain validation (mirrors magic-link.ts logic) ───────────
//
// The magic-link handler validates email addresses before sending.
// We replicate the exact validation logic here for direct testing.

const ALLOWED_DOMAIN = 'pwcgov.org';

interface EmailValidationResult {
  valid: boolean;
  error?: string;
}

function validateEmail(rawEmail: string | undefined | null): EmailValidationResult {
  if (!rawEmail) {
    return { valid: false, error: 'Valid email address required' };
  }

  const email = rawEmail.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return { valid: false, error: 'Valid email address required' };
  }

  // Reject emails with multiple @ signs
  if (email.split('@').length !== 2) {
    return { valid: false, error: 'Invalid email address' };
  }

  // Restrict to allowed domain
  const domain = email.split('@')[1];
  if (domain !== ALLOWED_DOMAIN) {
    return { valid: false, error: `Only @${ALLOWED_DOMAIN} email addresses are allowed` };
  }

  return { valid: true };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Email Domain Validation', () => {
  describe('valid @pwcgov.org emails', () => {
    it('accepts a standard @pwcgov.org email', () => {
      const result = validateEmail('jdoe@pwcgov.org');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts email with dots in local part', () => {
      const result = validateEmail('john.doe@pwcgov.org');
      expect(result.valid).toBe(true);
    });

    it('accepts email with plus addressing', () => {
      const result = validateEmail('jdoe+test@pwcgov.org');
      expect(result.valid).toBe(true);
    });

    it('accepts email with hyphens in local part', () => {
      const result = validateEmail('john-doe@pwcgov.org');
      expect(result.valid).toBe(true);
    });

    it('accepts email with numbers in local part', () => {
      const result = validateEmail('jdoe123@pwcgov.org');
      expect(result.valid).toBe(true);
    });
  });

  describe('case insensitivity (lowercased before check)', () => {
    it('accepts uppercase email by lowercasing', () => {
      const result = validateEmail('JDOE@PWCGOV.ORG');
      expect(result.valid).toBe(true);
    });

    it('accepts mixed case email', () => {
      const result = validateEmail('JDoe@PwcGov.Org');
      expect(result.valid).toBe(true);
    });

    it('accepts all-caps domain', () => {
      const result = validateEmail('user@PWCGOV.ORG');
      expect(result.valid).toBe(true);
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading whitespace', () => {
      const result = validateEmail('  user@pwcgov.org');
      expect(result.valid).toBe(true);
    });

    it('trims trailing whitespace', () => {
      const result = validateEmail('user@pwcgov.org  ');
      expect(result.valid).toBe(true);
    });

    it('trims both leading and trailing whitespace', () => {
      const result = validateEmail('  user@pwcgov.org  ');
      expect(result.valid).toBe(true);
    });
  });

  describe('rejected domains', () => {
    it('@evil.com is rejected', () => {
      const result = validateEmail('hacker@evil.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pwcgov.org');
    });

    it('@gmail.com is rejected', () => {
      const result = validateEmail('user@gmail.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pwcgov.org');
    });

    it('@dcvfd.org is rejected (not the allowed domain)', () => {
      const result = validateEmail('user@dcvfd.org');
      expect(result.valid).toBe(false);
    });

    it('@pwcgov.org.evil.com is rejected (subdomain attack)', () => {
      const result = validateEmail('user@pwcgov.org.evil.com');
      expect(result.valid).toBe(false);
    });

    it('@notpwcgov.org is rejected (prefix match attack)', () => {
      const result = validateEmail('user@notpwcgov.org');
      expect(result.valid).toBe(false);
    });

    it('empty domain after @ is rejected', () => {
      const result = validateEmail('user@');
      expect(result.valid).toBe(false);
    });
  });

  describe('multiple @ signs rejected', () => {
    it('email with two @ signs is rejected', () => {
      const result = validateEmail('user@@pwcgov.org');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('email with @ in local part is rejected', () => {
      const result = validateEmail('us@er@pwcgov.org');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('email with three @ signs is rejected', () => {
      const result = validateEmail('a@b@c@pwcgov.org');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });
  });

  describe('missing or empty email', () => {
    it('undefined email is rejected', () => {
      const result = validateEmail(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Valid email address required');
    });

    it('null email is rejected', () => {
      const result = validateEmail(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Valid email address required');
    });

    it('empty string is rejected', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Valid email address required');
    });

    it('whitespace-only string is rejected', () => {
      const result = validateEmail('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Valid email address required');
    });

    it('email without @ is rejected', () => {
      const result = validateEmail('nodomain');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Valid email address required');
    });
  });
});
