/**
 * Proxies /api/* from the Pages domain to the Node API.
 *
 * Why proxy instead of calling the API host directly from the browser:
 * the session cookie is SameSite=Lax, which browsers do not send on
 * cross-site requests. Keeping the API on the same origin as the client
 * preserves that cookie, and with it the CSRF design - no third-party
 * cookies, no SameSite=None, no weakening of the origin check.
 */

interface Env {
  /** Base URL of the deployed API, e.g. https://infin8-calendar-api.onrender.com */
  API_ORIGIN?: string;
}

interface Context {
  request: Request;
  env: Env;
}

/** Hop-by-hop and connection specific headers that must not be forwarded. */
const STRIP_FROM_REQUEST = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  // Asking the origin for identity keeps body and Content-Encoding in step;
  // Cloudflare compresses again on the way to the browser.
  'accept-encoding',
];

const STRIP_FROM_RESPONSE = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

function problem(message: string, status = 502): Response {
  return new Response(JSON.stringify({ error: { code: 'proxy_error', message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  const origin = env.API_ORIGIN?.trim().replace(/\/+$/, '');
  if (!origin) {
    return problem(
      'The calendar service is not configured yet. Set API_ORIGIN in the Pages project to the URL of the API.',
      503
    );
  }

  let target: URL;
  try {
    const incoming = new URL(request.url);
    target = new URL(incoming.pathname + incoming.search, origin);
  } catch {
    return problem('The calendar service address is not a valid URL.', 503);
  }

  // Rebuilding from the original Request carries the method, body and headers
  // across without re-streaming the body by hand.
  const proxied = new Request(target.toString(), request);
  for (const name of STRIP_FROM_REQUEST) proxied.headers.delete(name);
  // Let the API see who actually asked, for its origin check and its logs.
  proxied.headers.set('X-Forwarded-Host', new URL(request.url).host);
  proxied.headers.set('X-Forwarded-Proto', 'https');

  let upstream: Response;
  try {
    upstream = await fetch(proxied, { redirect: 'manual' });
  } catch {
    return problem('We could not reach the calendar service. Please try again in a moment.');
  }

  // Constructing from the upstream Response preserves repeated headers,
  // Set-Cookie among them, which a plain Headers copy would flatten.
  const response = new Response(upstream.body, upstream);
  for (const name of STRIP_FROM_RESPONSE) response.headers.delete(name);
  return response;
};
