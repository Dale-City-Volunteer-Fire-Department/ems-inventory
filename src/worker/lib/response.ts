// HTTP response helpers

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function ok(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
}

export function created(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: JSON_HEADERS });
}

export function unauthorized(message = 'Unauthorized'): Response {
  return new Response(JSON.stringify({ error: message }), { status: 401, headers: JSON_HEADERS });
}

export function forbidden(message = 'Forbidden'): Response {
  return new Response(JSON.stringify({ error: message }), { status: 403, headers: JSON_HEADERS });
}

export function notFound(message = 'Not found'): Response {
  return new Response(JSON.stringify({ error: message }), { status: 404, headers: JSON_HEADERS });
}

export function serverError(message = 'Internal server error'): Response {
  console.error('[500]', message);
  return new Response(JSON.stringify({ error: message }), { status: 500, headers: JSON_HEADERS });
}
