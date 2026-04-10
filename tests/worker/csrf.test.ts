import { describe, it, expect } from 'vitest';
import { verifyCsrfOrigin } from '../../src/worker/index';

// ── Helper: build a Request with specific method, path, and origin ──

function makeRequest(
  method: string,
  path: string,
  origin?: string,
): Request {
  const headers: Record<string, string> = {};
  if (origin) {
    headers['Origin'] = origin;
  }
  return new Request(`https://emsinventory.dcvfd.org${path}`, {
    method,
    headers,
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CSRF Origin Verification', () => {
  describe('GET requests are not checked', () => {
    it('GET /api/items with no Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('GET', '/api/items'));
      expect(result).toBeNull();
    });

    it('GET /api/users with no Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('GET', '/api/users'));
      expect(result).toBeNull();
    });

    it('GET /api/inventory/history with invalid Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('GET', '/api/inventory/history', 'https://evil.com'));
      expect(result).toBeNull();
    });
  });

  describe('POST with valid Origin passes', () => {
    it('POST with production Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/inventory/submit', 'https://emsinventory.dcvfd.org'));
      expect(result).toBeNull();
    });

    it('POST with localhost:5173 Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/pin', 'http://localhost:5173'));
      expect(result).toBeNull();
    });

    it('POST with localhost:8787 Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/pin', 'http://localhost:8787'));
      expect(result).toBeNull();
    });

    it('POST with 127.0.0.1:5173 Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/pin', 'http://127.0.0.1:5173'));
      expect(result).toBeNull();
    });
  });

  describe('POST with missing Origin returns 403', () => {
    it('POST /api/auth/pin with no Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/pin'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('POST /api/inventory/submit with no Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/inventory/submit'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('rejection body contains descriptive error message', async () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/pin'));
      expect(result).not.toBeNull();
      const body = await result!.json() as { error: string };
      expect(body.error).toContain('Origin');
    });
  });

  describe('POST with invalid Origin returns 403', () => {
    it('POST with evil.com Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/inventory/submit', 'https://evil.com'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('POST with attacker subdomain is rejected', () => {
      const result = verifyCsrfOrigin(
        makeRequest('POST', '/api/auth/pin', 'https://emsinventory.dcvfd.org.evil.com'),
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('POST with http (not https) production URL is rejected', () => {
      const result = verifyCsrfOrigin(
        makeRequest('POST', '/api/inventory/submit', 'http://emsinventory.dcvfd.org'),
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('POST with Origin containing extra path is rejected', () => {
      const result = verifyCsrfOrigin(
        makeRequest('POST', '/api/auth/pin', 'https://emsinventory.dcvfd.org/some/path'),
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe('PUT and DELETE are also checked', () => {
    it('PUT with valid Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('PUT', '/api/items', 'https://emsinventory.dcvfd.org'));
      expect(result).toBeNull();
    });

    it('PUT with no Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('PUT', '/api/items'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('DELETE with valid Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('DELETE', '/api/items', 'https://emsinventory.dcvfd.org'));
      expect(result).toBeNull();
    });

    it('DELETE with no Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('DELETE', '/api/items'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('PATCH with valid Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('PATCH', '/api/items', 'https://emsinventory.dcvfd.org'));
      expect(result).toBeNull();
    });

    it('PATCH with no Origin is rejected', () => {
      const result = verifyCsrfOrigin(makeRequest('PATCH', '/api/items'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });
  });

  describe('exempt paths are not checked', () => {
    it('POST /api/auth/entra/callback is exempt (no Origin needed)', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/entra/callback'));
      expect(result).toBeNull();
    });

    it('POST /api/auth/magic-link/verify is exempt (no Origin needed)', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/api/auth/magic-link/verify'));
      expect(result).toBeNull();
    });

    it('exempt paths pass even with invalid Origin', () => {
      const result = verifyCsrfOrigin(
        makeRequest('POST', '/api/auth/entra/callback', 'https://evil.com'),
      );
      expect(result).toBeNull();
    });
  });

  describe('non-API routes are not checked', () => {
    it('POST to non-API path with no Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/some/other/path'));
      expect(result).toBeNull();
    });

    it('PUT to root path with invalid Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('PUT', '/', 'https://evil.com'));
      expect(result).toBeNull();
    });

    it('POST to /login with no Origin passes (not an API route)', () => {
      const result = verifyCsrfOrigin(makeRequest('POST', '/login'));
      expect(result).toBeNull();
    });
  });

  describe('HEAD and OPTIONS are not checked', () => {
    it('HEAD request to API route with no Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('HEAD', '/api/items'));
      expect(result).toBeNull();
    });

    it('OPTIONS request to API route with no Origin passes', () => {
      const result = verifyCsrfOrigin(makeRequest('OPTIONS', '/api/items'));
      expect(result).toBeNull();
    });
  });
});
