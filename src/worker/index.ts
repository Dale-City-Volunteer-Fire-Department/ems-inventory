import { Env } from './types';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok', app: env.APP_NAME, timestamp: new Date().toISOString() });
    }

    // Serve static assets for non-API routes
    return new Response('EMS Inventory — Coming Soon', { status: 200 });
  },
};
