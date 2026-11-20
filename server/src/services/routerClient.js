const ROUTER_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY;
const TIMEOUT_MS = 120_000; // 2 min — free endpoints can be slow

if (!GATEWAY_KEY) {
  throw new Error('GATEWAY_KEY is required — add it to .env');
}

const ENDPOINT = `${ROUTER_URL}/v1/chat/completions`;

class RouterError extends Error {
  constructor(msg, opts) { super(msg, opts); this.name = 'RouterError'; }
}
class RouterUpstreamError extends RouterError {
  constructor(status, body, headers) {
    super(`upstream ${status}`);
    this.name = 'RouterUpstreamError';
    this.status = status;
    this.body = body;
    this.headers = headers || {};
  }
}
class RouterUnavailableError extends RouterError {
  constructor(cause) { super('router unavailable', { cause }); this.name = 'RouterUnavailableError'; }
}

async function chatCompletion({ model, messages, temperature, max_tokens, extraHeaders = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GATEWAY_KEY}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[router]', err.name, err.message);
    throw new RouterUnavailableError(err);
  } finally {
    clearTimeout(timer);
  }

  const routerHeaders = {};
  for (const h of ['x-router-model', 'x-router-task', 'x-router-hops',
                   'x-router-latency-ms', 'x-router-attempts']) {
    const v = res.headers.get(h);
    if (v !== null) routerHeaders[h] = v;
  }

  const raw = await res.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { raw }; }

  if (!res.ok) throw new RouterUpstreamError(res.status, body, routerHeaders);
  return { body, headers: routerHeaders };
}

module.exports = {
  chatCompletion,
  RouterError,
  RouterUpstreamError,
  RouterUnavailableError,
};