import { createServer } from 'node:http';

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
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

export function createWeatherApiServer({ runtime, heartbeatMs = 15_000 }) {
  if (!runtime || typeof runtime.getSnapshot !== 'function' || typeof runtime.subscribe !== 'function') {
    throw new Error('createWeatherApiServer requires a weather runtime');
  }
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error('createWeatherApiServer requires a positive heartbeatMs');
  }

  const clients = new Set();

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

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
        sourceHealth: snapshot.sourceHealth || {},
        ts: snapshot.ts,
      });
      return;
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
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
