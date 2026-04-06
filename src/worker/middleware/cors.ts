// CORS middleware

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:5173'];
const PROD_ORIGIN = 'https://emsinventory.dcvfd.org';

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') ?? '';
  // In dev, allow localhost origins; in prod, lock to the real domain
  if (DEV_ORIGINS.includes(origin)) return origin;
  if (origin === PROD_ORIGIN) return origin;
  // Fallback: allow the first dev origin (permissive for dev)
  return DEV_ORIGINS[0];
}

export function handleCorsPreflightRequest(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = getAllowedOrigin(request);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function addCorsHeaders(request: Request, response: Response): Response {
  const origin = getAllowedOrigin(request);
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', origin);
  newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  return newResponse;
}
