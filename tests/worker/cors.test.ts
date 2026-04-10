import { describe, it, expect } from 'vitest';
import { handleCorsPreflightRequest, addCorsHeaders } from '../../src/worker/middleware/cors';

// ── Helper ──────────────────────────────────────────────────────────

function makeRequest(method: string, origin?: string): Request {
  const headers: Record<string, string> = {};
  if (origin) headers['Origin'] = origin;
  return new Request('https://emsinventory.dcvfd.org/api/items', { method, headers });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CORS Middleware', () => {
  describe('handleCorsPreflightRequest', () => {
    it('returns null for non-OPTIONS requests', () => {
      expect(handleCorsPreflightRequest(makeRequest('GET'))).toBeNull();
      expect(handleCorsPreflightRequest(makeRequest('POST'))).toBeNull();
      expect(handleCorsPreflightRequest(makeRequest('PUT'))).toBeNull();
      expect(handleCorsPreflightRequest(makeRequest('DELETE'))).toBeNull();
    });

    it('returns 204 for OPTIONS with valid production origin', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'https://emsinventory.dcvfd.org'));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(204);
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('https://emsinventory.dcvfd.org');
      expect(res!.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('returns 204 for OPTIONS with localhost:5173 origin', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'http://localhost:5173'));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(204);
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('returns 204 for OPTIONS with localhost:8787 origin', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'http://localhost:8787'));
      expect(res).not.toBeNull();
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8787');
    });

    it('returns 204 for OPTIONS with 127.0.0.1:5173 origin', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'http://127.0.0.1:5173'));
      expect(res).not.toBeNull();
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:5173');
    });

    it('returns 204 without Allow-Origin for unrecognized origin', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'https://evil.com'));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(204);
      // No Access-Control-Allow-Origin should be set for unrecognized origins
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('returns 204 without Allow-Origin when no origin header', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS'));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(204);
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('includes allowed methods header', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'https://emsinventory.dcvfd.org'));
      expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      expect(res!.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });

    it('includes allowed headers', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'https://emsinventory.dcvfd.org'));
      expect(res!.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('includes max-age cache header', () => {
      const res = handleCorsPreflightRequest(makeRequest('OPTIONS', 'https://emsinventory.dcvfd.org'));
      expect(res!.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('addCorsHeaders', () => {
    it('adds CORS headers to response for valid origin', () => {
      const request = makeRequest('GET', 'https://emsinventory.dcvfd.org');
      const response = new Response('{}', { status: 200 });
      const result = addCorsHeaders(request, response);
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://emsinventory.dcvfd.org');
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('adds CORS headers for dev origins', () => {
      const request = makeRequest('GET', 'http://localhost:5173');
      const response = new Response('{}', { status: 200 });
      const result = addCorsHeaders(request, response);
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    });

    it('does not add Allow-Origin for unrecognized origin', () => {
      const request = makeRequest('GET', 'https://evil.com');
      const response = new Response('{}', { status: 200 });
      const result = addCorsHeaders(request, response);
      expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('preserves original response status', () => {
      const request = makeRequest('GET', 'https://emsinventory.dcvfd.org');
      const response = new Response('{}', { status: 404 });
      const result = addCorsHeaders(request, response);
      expect(result.status).toBe(404);
    });

    it('preserves original response body', async () => {
      const request = makeRequest('GET', 'https://emsinventory.dcvfd.org');
      const response = new Response(JSON.stringify({ test: true }), { status: 200 });
      const result = addCorsHeaders(request, response);
      const body = await result.json();
      expect(body).toEqual({ test: true });
    });
  });
});
