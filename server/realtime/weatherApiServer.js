import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Accept, Content-Type',
};

const MAX_JSON_BODY_BYTES = 64 * 1024;

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': new TextEncoder().encode(payload).length,
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function formatSseEvent(event) {
  const type = event.type || 'message';
  return `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid_json');
  }
}

export function createWeatherApiServer({ runtime, pushService, heartbeatMs = 15_000 }) {
  if (!runtime || typeof runtime.getSnapshot !== 'function' || typeof runtime.subscribe !== 'function') {
    throw new Error('createWeatherApiServer requires a weather runtime');
  }
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error('createWeatherApiServer requires a positive heartbeatMs');
  }

  const clients = new Set();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (url.pathname === '/api/push/public-key' && req.method === 'GET') {
      writeJson(res, 200, {
        configured: Boolean(pushService?.isConfigured?.()),
        publicKey: pushService?.getPublicKey?.() || null,
      });
      return;
    }

    if (url.pathname === '/api/push/subscriptions' && req.method === 'POST') {
      if (!isSameOriginRequest(req)) {
        writeJson(res, 403, { error: 'cross_origin_mutation_forbidden' });
        return;
      }
      try {
        const result = await pushService?.upsert?.(await readJson(req));
        if (!result) throw new Error('push_not_configured');
        writeJson(res, 200, { ok: true, ...result });
      } catch (error) {
        const badRequest = ['invalid_json', 'request_too_large', 'invalid_push_subscription', 'invalid_push_subscription_keys'].includes(error?.message);
        writeJson(res, badRequest ? 400 : 503, { error: error?.message || 'push_subscription_failed' });
      }
      return;
    }

    if (url.pathname === '/api/push/subscriptions' && req.method === 'DELETE') {
      if (!isSameOriginRequest(req)) {
        writeJson(res, 403, { error: 'cross_origin_mutation_forbidden' });
        return;
      }
      try {
        const { endpoint } = await readJson(req);
        if (typeof endpoint !== 'string') {
          writeJson(res, 400, { error: 'invalid_endpoint' });
          return;
        }
        const result = await pushService?.remove?.(endpoint);
        writeJson(res, 200, { ok: true, ...(result || { removed: false }) });
      } catch (error) {
        writeJson(res, 400, { error: error?.message || 'push_unsubscribe_failed' });
      }
      return;
    }

    if (req.method !== 'GET') {
      writeJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    if (url.pathname === '/api/weather') {
      writeJson(res, 200, runtime.getSnapshot());
      return;
    }

    if (url.pathname === '/api/health') {
      const snapshot = runtime.getSnapshot();
      writeJson(res, 200, {
        status: 'ok',
        sseClients: clients.size,
        pushConfigured: Boolean(pushService?.isConfigured?.()),
        pushSubscriptions: pushService?.getSubscriptionCount?.() ?? 0,
        sourceHealth: snapshot.sourceHealth || {},
        ts: snapshot.ts,
      });
      return;
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        ...CORS_HEADERS,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.flushHeaders?.();

      const client = { res };
      clients.add(client);
      res.write(formatSseEvent({
        type: 'weather:snapshot',
        data: runtime.getSnapshot(),
      }));

      const heartbeatId = setInterval(() => {
        if (!res.destroyed) {
          res.write(formatSseEvent({
            type: 'heartbeat',
            ts: new Date().toISOString(),
          }));
        }
      }, heartbeatMs);

      const unsubscribe = runtime.subscribe((event) => {
        if (!res.destroyed) {
          res.write(formatSseEvent(event));
        }
      });

      req.on('close', () => {
        clearInterval(heartbeatId);
        unsubscribe();
        clients.delete(client);
      });
      return;
    }

    writeJson(res, 404, { error: 'not_found' });
  });

  return server;
}
