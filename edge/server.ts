// The wall's server on Supabase Edge Functions (free), since the Vercel account stopped serving.
// One function, "api", answers every route the Vercel functions answered:
//   https://<project>.supabase.co/functions/v1/api/<route>   route = feed | live | remote | cron | telegram
//   https://<project>.supabase.co/functions/v1/api/mcp/<token>   (the Claude connector "צג חלל")
// The handlers in api/*.ts are reused as they are: a small adapter gives them the req/res shape they were written
// for. The pages themselves are served by GitHub Pages (another origin), hence the CORS headers.
// Built into one file by scripts/build-edge.mjs (dist/edge/api.js); supabase/functions/api/index.ts imports it.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import feed from '../api/feed.js';
import live from '../api/live.js';
import remote from '../api/remote.js';
import cron from '../api/cron.js';
import telegram from '../api/telegram.js';
import { buildServer, tokenOk as mcpTokenOk } from '../api/mcp.js';

type Handler = (req: any, res: any) => unknown;
const ROUTES: Record<string, Handler> = { feed, live, remote, cron, telegram };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-remote-token, x-remote-who, authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '86400',
};

/** Vercel's Cache-Control "s-maxage" was for its CDN; here there is none, so it becomes a short browser cache. */
function cacheHeader(v: string): string {
  const m = /s-maxage=(\d+)/.exec(v);
  return m ? `public, max-age=${Math.min(Number(m[1]), 30)}` : v;
}

async function runNodeStyle(h: Handler, request: Request, url: URL): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  let body: unknown = raw;
  if (raw && (headers['content-type'] || '').includes('json')) { try { body = JSON.parse(raw); } catch { body = raw; } }
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const req = { method: request.method, url: url.pathname + url.search, headers, query, body };

  return await new Promise<Response>((resolve, reject) => {
    let status = 200, done = false;
    const out = new Headers(CORS);
    const finish = (payload: BodyInit | null) => { if (done) return; done = true; resolve(new Response(payload, { status, headers: out })); };
    const res: any = {
      headersSent: false,
      status(code: number) { status = code; return res; },
      setHeader(k: string, v: string) { out.set(k, k.toLowerCase() === 'cache-control' ? cacheHeader(String(v)) : String(v)); return res; },
      json(data: unknown) { out.set('Content-Type', 'application/json; charset=utf-8'); res.headersSent = true; finish(JSON.stringify(data)); return res; },
      send(data: unknown) { res.headersSent = true; finish(typeof data === 'string' || data instanceof Uint8Array ? data as any : JSON.stringify(data)); return res; },
      end(data?: unknown) { res.headersSent = true; finish((data as any) ?? null); return res; },
      on() { return res; },
    };
    Promise.resolve(h(req, res)).then(() => finish(null), reject);
  });
}

async function mcp(request: Request, token: string): Promise<Response> {
  if (!(await mcpTokenOk(token).catch(() => false))) return Response.json({ error: 'not found' }, { status: 404, headers: CORS });
  if (request.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { ...CORS, Allow: 'POST' } });
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const r = await transport.handleRequest(request);
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
    const body = await r.arrayBuffer();
    return new Response(body, { status: r.status, headers: h });
  } catch (e) {
    console.error('mcp failed', e);
    return Response.json({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null }, { status: 500, headers: CORS });
  } finally {
    void transport.close(); void server.close();
  }
}

export async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  // The path arrives as /api/<route>, /functions/v1/api/<route> or /<route>; take what follows "api".
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.lastIndexOf('api');
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  try {
    if (rest[0] === 'mcp' && rest[1]) return await mcp(request, decodeURIComponent(rest[1]));
    const h = ROUTES[rest[0] || ''];
    if (!h) return Response.json({ ok: true, routes: Object.keys(ROUTES) }, { status: rest[0] ? 404 : 200, headers: CORS });
    return await runNodeStyle(h, request, url);
  } catch (e: any) {
    console.error('api failed', e);
    return Response.json({ error: String(e?.message || e) }, { status: 500, headers: CORS });
  }
}
