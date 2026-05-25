import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDemoWeatherSources } from './demoSources.js';
import { createWeatherApiServer } from './weatherApiServer.js';
import { createWeatherRuntime } from './weatherRuntime.js';
import { createWeatherScheduler } from './weatherScheduler.js';
import { createFileWeatherStore } from './weatherStore.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_INTERVAL_MS = 20_000;
const DEFAULT_HEARTBEAT_MS = 15_000;

export function createSystemClock() {
  return {
    now: () => Date.now(),
  };
}

function defaultStorePath() {
  const cwd = globalThis.process?.cwd?.() ?? '.';
  return join(cwd, 'data', 'weather-state.json');
}

async function listen(server, { host, port }) {
  server.listen(port, host);
  await once(server, 'listening');
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

export async function createWeatherService({
  clock = createSystemClock(),
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  storePath = defaultStorePath(),
  intervalMs = DEFAULT_INTERVAL_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  sources = createDemoWeatherSources({ clock, pollMs: intervalMs }),
} = {}) {
  const store = createFileWeatherStore({ filePath: storePath });
  const persisted = await store.loadState();
  const runtime = createWeatherRuntime({
    clock,
    sources,
    initialSnapshot: persisted.snapshot,
    store,
  });
  const apiServer = createWeatherApiServer({ runtime, heartbeatMs });
  const scheduler = createWeatherScheduler({ runtime, intervalMs });
  let baseUrl = null;

  return {
    runtime,
    scheduler,
    store,
    get baseUrl() {
      return baseUrl;
    },
    async start() {
      if (baseUrl) return { baseUrl };
      baseUrl = await listen(apiServer, { host, port });
      await scheduler.pollOnce();
      scheduler.start({ immediate: false });
      return { baseUrl };
    },
    async stop() {
      scheduler.stop();
      if (!baseUrl) return;
      await new Promise((resolve, reject) => {
        apiServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      baseUrl = null;
    },
  };
}

async function main() {
  const env = globalThis.process?.env ?? {};
  const service = await createWeatherService({
    host: env.HOST || DEFAULT_HOST,
    port: Number(env.PORT || DEFAULT_PORT),
    storePath: env.WEATHER_STORE_PATH || defaultStorePath(),
    intervalMs: Number(env.WEATHER_POLL_MS || DEFAULT_INTERVAL_MS),
    heartbeatMs: Number(env.WEATHER_HEARTBEAT_MS || DEFAULT_HEARTBEAT_MS),
  });
  const { baseUrl } = await service.start();
  globalThis.console?.log?.(`Beacon weather service listening on ${baseUrl}`);

  const shutdown = async () => {
    await service.stop();
    globalThis.process?.exit?.(0);
  };
  globalThis.process?.once?.('SIGINT', shutdown);
  globalThis.process?.once?.('SIGTERM', shutdown);
}

if (globalThis.process?.argv?.[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href) {
  main().catch((error) => {
    globalThis.console?.error?.(error);
    globalThis.process?.exit?.(1);
  });
}
