import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import webpush from 'web-push';
import { createDemoWeatherSources } from './demoSources.js';
import { createRealWeatherSources, parseDisabledSourceIds } from './realSources.js';
import { createWeatherApiServer } from './weatherApiServer.js';
import { createWeatherRuntime } from './weatherRuntime.js';
import { createWeatherScheduler } from './weatherScheduler.js';
import { createFileWeatherStore } from './weatherStore.js';
import { createFilePushStore } from './pushStore.js';
import { createPushNotificationService } from './pushNotificationService.js';
import { createMonitoringService } from '../monitoring/monitoringService.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_INTERVAL_MS = 20_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_SOURCE_MODE = 'demo';
const DEFAULT_MAX_OBSERVATIONS = 500;

export function createSystemClock() {
  return {
    now: () => Date.now(),
  };
}

function defaultStorePath() {
  const cwd = globalThis.process?.cwd?.() ?? '.';
  return join(cwd, 'data', 'weather-state.json');
}

function defaultPushStorePath() {
  const cwd = globalThis.process?.cwd?.() ?? '.';
  return join(cwd, 'data', 'push-state.json');
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
  pushStorePath = defaultPushStorePath(),
  intervalMs = DEFAULT_INTERVAL_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  maxObservations = DEFAULT_MAX_OBSERVATIONS,
  sourceMode = DEFAULT_SOURCE_MODE,
  env = globalThis.process?.env ?? {},
  fetchImpl = globalThis.fetch,
  sources = sourceMode === 'real'
    ? createRealWeatherSources({
        clock,
        env,
        fetchImpl,
        pollMs: intervalMs,
        requestTimeoutMs: Number(env.WEATHER_REQUEST_TIMEOUT_MS || 15_000),
      })
    : createDemoWeatherSources({ clock, pollMs: intervalMs }),
  monitoringService = createMonitoringService({ env, fetchImpl, clock }),
} = {}) {
  const store = createFileWeatherStore({ filePath: storePath, maxObservations });
  const persisted = await store.loadState();
  const runtime = createWeatherRuntime({
    clock,
    sources,
    initialSnapshot: persisted.snapshot,
    store,
    disabledSourceIds: sourceMode === 'real'
      ? parseDisabledSourceIds(env.WEATHER_DISABLED_SOURCE_IDS)
      : [],
  });
  const vapidPublicKey = env.VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = env.VAPID_SUBJECT || 'mailto:admin@example.com';
  const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);
  if (pushConfigured) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const pushService = await createPushNotificationService({
    store: createFilePushStore({ filePath: pushStorePath }),
    sender: pushConfigured ? webpush : null,
    publicKey: pushConfigured ? vapidPublicKey : '',
  });
  const unsubscribePush = runtime.subscribe((event) => {
    if (event.type === 'weather:update') {
      pushService.handleSnapshot(event.data).catch((error) => {
        globalThis.console?.error?.('Push alert evaluation failed:', error);
      });
    }
  });
  const unsubscribeMonitoring = runtime.subscribe((event) => monitoringService.handleRuntimeEvent(event));
  const apiServer = createWeatherApiServer({
    runtime,
    pushService,
    monitoringService,
    clock,
    heartbeatMs,
    readinessMaxAgeMs: Number(env.WEATHER_READY_MAX_AGE_MS || 300_000),
  });
  const scheduler = createWeatherScheduler({
    runtime,
    intervalMs,
    onSuccess: () => monitoringService.sendHeartbeat(),
    onError: (error) => monitoringService.captureException(error, {
      fingerprint: ['weather-scheduler-failed'],
      tags: { incidentType: 'scheduler' },
    }),
  });
  let baseUrl = null;

  return {
    runtime,
    scheduler,
    store,
    pushService,
    monitoringService,
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
      unsubscribePush();
      unsubscribeMonitoring();
      if (!baseUrl) return;
      await new Promise((resolve, reject) => {
        apiServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      baseUrl = null;
      await monitoringService.flush();
    },
  };
}

let mainMonitoringService = null;

async function main() {
  const env = globalThis.process?.env ?? {};
  mainMonitoringService = createMonitoringService({ env });
  const service = await createWeatherService({
    host: env.HOST || DEFAULT_HOST,
    port: Number(env.PORT || DEFAULT_PORT),
    storePath: env.WEATHER_STORE_PATH || defaultStorePath(),
    pushStorePath: env.PUSH_STORE_PATH || defaultPushStorePath(),
    intervalMs: Number(env.WEATHER_POLL_MS || DEFAULT_INTERVAL_MS),
    heartbeatMs: Number(env.WEATHER_HEARTBEAT_MS || DEFAULT_HEARTBEAT_MS),
    maxObservations: Number(env.WEATHER_MAX_OBSERVATIONS || DEFAULT_MAX_OBSERVATIONS),
    sourceMode: env.WEATHER_SOURCE_MODE || DEFAULT_SOURCE_MODE,
    env,
    monitoringService: mainMonitoringService,
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
  main().catch(async (error) => {
    mainMonitoringService?.captureException(error, {
      fingerprint: ['weather-service-startup-failed'],
      tags: { incidentType: 'startup' },
    });
    globalThis.console?.error?.(error);
    await mainMonitoringService?.flush?.();
    globalThis.process?.exit?.(1);
  });
}
