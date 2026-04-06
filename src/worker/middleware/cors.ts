// CORS middleware

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:5173'];
const PROD_ORIGIN = 'https://emsinventory.dcvfd.org';

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') ?? '';
  // In dev, allow localhost origins; in prod, lock to the real domain
  if (DEV_ORIGINS.includes(origin)) return origin;
  if (origin === PROD_ORIGIN) return origin;
  // Unrecognized origin — return empty to deny CORS
  return '';
}

export function handleCorsPreflightRequest(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = getAllowedOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return new Response(null, { status: 204, headers });
}

export function addCorsHeaders(request: Request, response: Response): Response {
  const origin = getAllowedOrigin(request);
  const newResponse = new Response(response.body, response);
  if (origin) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin);
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return newResponse;
}
