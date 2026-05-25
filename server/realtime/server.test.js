import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWeatherService } from './server.js';

const tempDirs = [];

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

async function makeStorePath() {
  const dir = await mkdtemp(join(tmpdir(), 'beacon-weather-service-'));
  tempDirs.push(dir);
  return join(dir, 'weather-state.json');
}

async function waitForJson(url, predicate) {
  let lastPayload = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(url);
    lastPayload = await response.json();
    if (predicate(lastPayload)) return lastPayload;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${url}. Last payload: ${JSON.stringify(lastPayload)}`);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('weather service entrypoint contract', () => {
  it('starts a no-secret local backend and persists demo weather state', async () => {
    const storePath = await makeStorePath();
    const service = await createWeatherService({
      clock: makeClock(),
      host: '127.0.0.1',
      port: 0,
      storePath,
      intervalMs: 20_000,
      heartbeatMs: 50,
    });

    const { baseUrl } = await service.start();

    try {
      const health = await waitForJson(`${baseUrl}/api/health`, (payload) => payload.status === 'ok');
      expect(health).toMatchObject({
        status: 'ok',
        sseClients: 0,
      });

      const snapshot = await waitForJson(
        `${baseUrl}/api/weather`,
        (payload) => Boolean(payload.windData?.porticcio?.live?.windSpeed),
      );
      expect(snapshot.sourceHealth.windsup_porticcio.status).toBe('ok');

      const persisted = JSON.parse(await readFile(storePath, 'utf8'));
      expect(persisted.snapshot.windData.porticcio.live.windSpeed).toBe(snapshot.windData.porticcio.live.windSpeed);
      expect(persisted.observations.some((item) => item.sourceId === 'windsup_porticcio')).toBe(true);
    } finally {
      await service.stop();
    }
  });

  it('passes the observation retention limit to the persistent store', async () => {
    const storePath = await makeStorePath();
    const service = await createWeatherService({
      clock: makeClock(),
      host: '127.0.0.1',
      port: 0,
      storePath,
      intervalMs: 20_000,
      heartbeatMs: 50,
      maxObservations: 1,
    });

    const { baseUrl } = await service.start();

    try {
      await waitForJson(`${baseUrl}/api/weather`, (payload) => Boolean(payload.windData?.porticcio?.live?.windSpeed));
      const persisted = JSON.parse(await readFile(storePath, 'utf8'));
      expect(persisted.observations).toHaveLength(1);
    } finally {
      await service.stop();
    }
  });

  it('can run in real-source mode with mocked upstream fetchers and no browser-exposed secrets', async () => {
    const storePath = await makeStorePath();
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('DPPaquetObs')) {
        return {
          ok: true,
          json: async () => [{
            validity_time: '2026-05-25T08:00:00Z',
            ff: 5,
            fxi10: 8,
            dd: 270,
            t: 293.15,
          }],
        };
      }
      if (target.includes('api.pioupiou.fr/v1/live')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              measurements: {
                wind_speed_avg: 18.52,
                wind_speed_max: 27.78,
                wind_heading: 245,
              },
            },
          }),
        };
      }
      if (target.includes('api.pioupiou.fr/v1/archive')) {
        return {
          ok: true,
          json: async () => ({
            data: [['2026-05-25T08:00:00Z', null, null, null, 18.52, 27.78, 245]],
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () => '',
        json: async () => ({}),
      };
    });

    const service = await createWeatherService({
      clock: makeClock(),
      host: '127.0.0.1',
      port: 0,
      storePath,
      intervalMs: 20_000,
      heartbeatMs: 50,
      sourceMode: 'real',
      fetchImpl,
      env: {
        METEOFRANCE_KEY: 'server-only-mf-key',
      },
    });

    const { baseUrl } = await service.start();

    try {
      const snapshot = await waitForJson(
        `${baseUrl}/api/weather`,
        (payload) => Boolean(payload.windData?.la_parata?.live?.windSpeed),
      );

      expect(snapshot.windData.la_parata.live.windSpeed).toBe('9.7');
      expect(snapshot.windData['owm-1202'].live.windSpeed).toBe('10.0');
      expect(snapshot.sourceHealth.meteofrance_20004003.status).toBe('ok');
    } finally {
      await service.stop();
    }
  });
});
