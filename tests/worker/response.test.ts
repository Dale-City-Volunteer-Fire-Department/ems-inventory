import { describe, it, expect } from 'vitest';
import {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  tooManyRequests,
  serverError,
} from '../../src/worker/lib/response';

// ── Tests ────────────────────────────────────────────────────────────

describe('Response Helpers', () => {
  describe('ok()', () => {
    it('returns 200 with JSON body', async () => {
      const res = ok({ items: [], count: 0 });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body).toEqual({ items: [], count: 0 });
    });

    it('serializes nested objects', async () => {
      const data = { user: { id: 1, name: 'Test' }, meta: { page: 1 } };
      const res = ok(data);
      const body = await res.json();
      expect(body).toEqual(data);
    });

    it('handles null data', async () => {
      const res = ok(null);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeNull();
    });

    it('handles array data', async () => {
      const res = ok([1, 2, 3]);
      const body = await res.json();
      expect(body).toEqual([1, 2, 3]);
    });
  });

  describe('created()', () => {
    it('returns 201 with JSON body', async () => {
      const res = created({ id: 5, name: 'New Item' });
      expect(res.status).toBe(201);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body).toEqual({ id: 5, name: 'New Item' });
    });
  });

  describe('badRequest()', () => {
    it('returns 400 with error message', async () => {
      const res = badRequest('Missing required field');
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Missing required field');
    });

    it('has application/json content type', () => {
      const res = badRequest('test');
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('unauthorized()', () => {
    it('returns 401 with default message', async () => {
      const res = unauthorized();
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with custom message', async () => {
      const res = unauthorized('Authentication required');
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Authentication required');
    });
  });

  describe('forbidden()', () => {
    it('returns 403 with default message', async () => {
      const res = forbidden();
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Forbidden');
    });

    it('returns 403 with custom message', async () => {
      const res = forbidden('Requires admin role or higher');
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Requires admin role or higher');
    });
  });

  describe('notFound()', () => {
    it('returns 404 with default message', async () => {
      const res = notFound();
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Not found');
    });

    it('returns 404 with custom message', async () => {
      const res = notFound('Item 42 not found');
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Item 42 not found');
    });
  });

  describe('tooManyRequests()', () => {
    it('returns 429 with default message', async () => {
      const res = tooManyRequests();
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Too many requests');
    });

    it('returns 429 with custom message', async () => {
      const res = tooManyRequests('Rate limit exceeded');
      expect(res.status).toBe(429);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Rate limit exceeded');
    });
  });

  describe('serverError()', () => {
    it('returns 500 with default message', async () => {
      const res = serverError();
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Internal server error');
    });

    it('returns 500 with custom message', async () => {
      const res = serverError('Database connection failed');
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Database connection failed');
    });
  });

  describe('all helpers return valid JSON responses', () => {
    it('every response has application/json content type', () => {
      const responses = [
        ok({ test: true }),
        created({ test: true }),
        badRequest('err'),
        unauthorized(),
        forbidden(),
        notFound(),
        tooManyRequests(),
        serverError(),
      ];

      for (const res of responses) {
        expect(res.headers.get('Content-Type')).toBe('application/json');
      }
    });
  });
});
