import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createWeatherRuntime } from './weatherRuntime.js';
import { createWeatherApiServer } from './weatherApiServer.js';

function makeClock(start = '2026-05-25T08:00:00.000Z') {
  let now = new Date(start).getTime();
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
      return now;
    },
  };
}

function reading(observedAt, value) {
  return {
    source: 'windsup_porticcio',
    observedAt,
    payload: {
      live: {
        windSpeed: value,
        windGust: value + 4,
        windDirection: 270,
      },
      history: [],
    },
  };
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function createSseFrameReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async readFrame(predicate, timeoutMs = 500) {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`No matching SSE frame within ${timeoutMs}ms`)), timeoutMs);
      });

      const read = async () => {
        for (let i = 0; i < 20; i += 1) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          const match = frames.find(predicate);
          if (match) return match;
        }
        throw new Error(`No matching SSE frame received. Buffer: ${buffer}`);
      };

      return Promise.race([read(), timeout]);
    },
    cancel() {
      return reader.cancel();
    },
  };
}

describe('weather API server contract', () => {
  it('serves snapshot, health, and weather:update SSE events from the runtime', async () => {
    const clock = makeClock();
    const source = {
      id: 'windsup_porticcio',
      pollMs: 20_000,
      fetch: vi
        .fn()
        .mockResolvedValueOnce(reading('2026-05-25T08:00:00.000Z', 10))
        .mockResolvedValueOnce(reading('2026-05-25T08:00:20.000Z', 15)),
    };
    const runtime = createWeatherRuntime({ clock, sources: [source] });
    const server = createWeatherApiServer({ runtime });
    const baseUrl = await listen(server);

    try {
      await runtime.pollDueSources();

      const snapshotResponse = await fetch(`${baseUrl}/api/weather`);
      expect(snapshotResponse.status).toBe(200);
      expect(snapshotResponse.headers.get('content-type')).toContain('application/json');
      const snapshot = await snapshotResponse.json();
      expect(snapshot).toMatchObject({
        windData: {
          porticcio: {
            live: {
              windSpeed: 10,
            },
          },
        },
        surfData: {},
        waterData: null,
      });
      expect(snapshot).toHaveProperty('ts');
      expect(snapshot).toHaveProperty('sourceHealth.windsup_porticcio.status', 'ok');

      const healthResponse = await fetch(`${baseUrl}/api/health`);
      expect(healthResponse.status).toBe(200);
      const health = await healthResponse.json();
      expect(health).toMatchObject({
        status: 'ok',
        sourceHealth: {
          windsup_porticcio: {
            status: 'ok',
          },
        },
      });
      expect(health.sseClients).toBe(0);

      const eventsResponse = await fetch(`${baseUrl}/api/events`);
      expect(eventsResponse.status).toBe(200);
      expect(eventsResponse.headers.get('content-type')).toContain('text/event-stream');

      clock.advance(20_000);
      const sseReader = createSseFrameReader(eventsResponse);
      const eventPromise = sseReader.readFrame((candidateFrame) => candidateFrame.includes('event: weather:update'));
      await runtime.pollDueSources();
      const frame = await eventPromise;
      await sseReader.cancel();

      expect(frame).toContain('event: weather:update');
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      const eventData = JSON.parse(dataLine.slice('data: '.length));
      expect(eventData.sources).toEqual(['windsup_porticcio']);
      expect(eventData.data.windData.porticcio.live.windSpeed).toBe(15);
      expect(eventData.latencyMs).toBeLessThanOrEqual(30_000);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns 404 for unknown API routes without polling sources', async () => {
    const runtime = createWeatherRuntime({
      clock: makeClock(),
      sources: [
        {
          id: 'windsup_porticcio',
          pollMs: 20_000,
          fetch: vi.fn(),
        },
      ],
    });
    const server = createWeatherApiServer({ runtime });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/api/missing`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('sends an initial snapshot event and heartbeat frames on the SSE stream', async () => {
    const runtime = createWeatherRuntime({
      clock: makeClock(),
      sources: [
        {
          id: 'windsup_porticcio',
          pollMs: 20_000,
          fetch: vi.fn().mockResolvedValue(reading('2026-05-25T08:00:00.000Z', 10)),
        },
      ],
    });
    const server = createWeatherApiServer({ runtime, heartbeatMs: 25 });
    const baseUrl = await listen(server);
    let eventsResponse;
    let sseReader;

    try {
      await runtime.pollDueSources();
      eventsResponse = await fetch(`${baseUrl}/api/events`);
      sseReader = createSseFrameReader(eventsResponse);

      const snapshotFrame = await sseReader.readFrame((frame) => frame.includes('event: weather:snapshot'));
      expect(snapshotFrame).toContain('data: ');

      const heartbeatFrame = await sseReader.readFrame((frame) => frame.includes('event: heartbeat'));
      expect(heartbeatFrame).toContain('event: heartbeat');
    } finally {
      await sseReader?.cancel().catch(() => {});
      await eventsResponse?.body?.cancel().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
